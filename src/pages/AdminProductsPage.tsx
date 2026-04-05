import {
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useState } from 'react'
import { fetchCategories } from '../api/fetchCategories'
import {
  createProduct,
  deleteProduct,
  listProductsAdmin,
  updateProduct,
  type ProductInput,
} from '../api/productsAdmin'
import { formatMoney } from '../lib/money'
import type { Category, Product } from '../types/pos'

const { Title, Text } = Typography

type FormValues = {
  categoryId?: string | null
  name: string
  nameEn?: string
  description?: string
  size?: string
  sku: string
  priceDollars: number
  isActive: boolean
}

function dollarsToCents(d: number): number {
  return Math.round(d * 100)
}

function centsToDollars(c: number): number {
  return Math.round(c) / 100
}

function toInput(values: FormValues): ProductInput {
  return {
    categoryId: values.categoryId ?? null,
    name: values.name,
    nameEn: values.nameEn?.trim() ? values.nameEn.trim() : null,
    description: values.description?.trim() ? values.description.trim() : null,
    size: values.size?.trim() ? values.size.trim() : null,
    sku: values.sku,
    priceCents: dollarsToCents(values.priceDollars),
    isActive: values.isActive,
  }
}

export function AdminProductsPage() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const categoryOptions = categories.map((c) => ({ label: c.name, value: c.id }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [plist, cats] = await Promise.all([listProductsAdmin(), fetchCategories()])
      setProducts(plist)
      setCategories(cats)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditingId(null)
    form.resetFields()
    form.setFieldsValue({
      name: '',
      nameEn: '',
      description: '',
      size: '',
      sku: '',
      priceDollars: 0,
      isActive: true,
      categoryId: categoryOptions[0]?.value,
    })
    setModalOpen(true)
  }

  const openEdit = (p: Product) => {
    setEditingId(p.id)
    form.setFieldsValue({
      categoryId: p.categoryId ?? undefined,
      name: p.name,
      nameEn: p.nameEn ?? '',
      description: p.description ?? '',
      size: p.size ?? '',
      sku: p.sku,
      priceDollars: centsToDollars(p.price),
      isActive: p.isActive,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    form.resetFields()
  }

  const submit = async () => {
    try {
      const values = await form.validateFields()
      const input = toInput(values)
      setSaving(true)
      if (editingId) {
        await updateProduct(editingId, input)
        message.success('Product updated')
      } else {
        await createProduct(input)
        message.success('Product created')
      }
      closeModal()
      await load()
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = (p: Product) => {
    modal.confirm({
      title: 'Delete product?',
      content: `“${p.name}” will be removed.`,
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteProduct(p.id)
          message.success('Deleted')
          await load()
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'Delete failed')
        }
      },
    })
  }

  const columns: ColumnsType<Product> = [
    {
      title: 'Name',
      key: 'name',
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{row.name}</Text>
          {row.nameEn ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.nameEn}
            </Text>
          ) : null}
        </Space>
      ),
    },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 120 },
    {
      title: 'Category',
      key: 'cat',
      width: 120,
      render: (_, row) => row.categoryName ?? '—',
    },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      align: 'right',
      render: (cents: number) => formatMoney(cents),
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'active',
      width: 88,
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>{active ? 'Yes' : 'No'}</Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_, row) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(row)}>
            Edit
          </Button>
          <Button type="link" size="small" danger onClick={() => onDelete(row)}>
            Delete
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="admin-page">
      <Space align="center" style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          Product Management
        </Title>
        <Button type="primary" onClick={openCreate}>
          New product
        </Button>
      </Space>

      <Card>
        <Table<Product>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={products}
          pagination={{ pageSize: 12 }}
          scroll={{ x: true }}
        />
      </Card>

      <Modal
        title={editingId ? 'Edit product' : 'Create product'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void submit()}
        confirmLoading={saving}
        destroyOnClose
        width={560}
        okText="Save"
      >
        <Form<FormValues> form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="nameEn" label="Name (English)">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="size" label="Size">
            <Input placeholder="e.g. Large" />
          </Form.Item>
          <Form.Item name="sku" label="SKU" rules={[{ required: true, message: 'Required' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="priceDollars"
            label="Price (USD)"
            rules={[{ required: true, type: 'number', min: 0 }]}
            extra="Stored in cents in the database."
          >
            <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="categoryId" label="Category">
            <Select
              allowClear
              placeholder="Select category"
              options={categoryOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
