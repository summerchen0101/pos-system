import {
  App,
  AutoComplete,
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
import { useCallback, useEffect, useState, type Key } from 'react'
import { listCategoriesAdmin } from '../api/categoriesAdmin'
import {
  bulkPatchProducts,
  createProduct,
  deleteProduct,
  listProductsAdmin,
  updateProduct,
  type ProductBulkPatch,
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

type BulkFormValues = {
  bulkCategoryId?: string | null
  bulkSize?: string
  bulkPriceDollars?: number | null
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
  const [bulkForm] = Form.useForm<BulkFormValues>()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])

  const categoryOptions = categories.map((c) => ({ label: c.name, value: c.id }))

  const sizeSuggestions = Array.from(
    new Set(
      products.map((p) => p.size?.trim()).filter((s): s is string => Boolean(s)),
    ),
  )
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [plist, cats] = await Promise.all([listProductsAdmin(), listCategoriesAdmin()])
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

  const openBulkEdit = () => {
    bulkForm.resetFields()
    setBulkModalOpen(true)
  }

  const closeBulkModal = () => {
    setBulkModalOpen(false)
    bulkForm.resetFields()
  }

  const submitBulk = async () => {
    const ids = selectedRowKeys.map(String)
    if (ids.length === 0) {
      message.warning('Select at least one product')
      return
    }

    const categoryTouched = bulkForm.isFieldTouched('bulkCategoryId')
    const sizeTouched = bulkForm.isFieldTouched('bulkSize')
    const priceTouched = bulkForm.isFieldTouched('bulkPriceDollars')

    if (!categoryTouched && !sizeTouched && !priceTouched) {
      message.warning('Change at least one field to apply')
      return
    }

    try {
      const values = await bulkForm.validateFields()
      const patch: ProductBulkPatch = {}
      if (categoryTouched) {
        patch.categoryId = values.bulkCategoryId ?? null
      }
      if (sizeTouched) {
        patch.size = values.bulkSize?.trim() ? values.bulkSize.trim() : null
      }
      if (priceTouched) {
        if (values.bulkPriceDollars == null || Number.isNaN(values.bulkPriceDollars)) {
          message.warning('Enter a price or leave that field unchanged')
          return
        }
        patch.priceCents = dollarsToCents(values.bulkPriceDollars)
      }

      setBulkSaving(true)
      await bulkPatchProducts(ids, products, patch)
      message.success(`Updated ${ids.length} product(s)`)
      closeBulkModal()
      setSelectedRowKeys([])
      await load()
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof Error ? e.message : 'Bulk update failed')
    } finally {
      setBulkSaving(false)
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
        <Space>
          <Button disabled={selectedRowKeys.length === 0} onClick={openBulkEdit}>
            Bulk edit
          </Button>
          <Button type="primary" onClick={openCreate}>
            New product
          </Button>
        </Space>
      </Space>

      <Card>
        <Table<Product>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={products}
          pagination={{ pageSize: 12 }}
          scroll={{ x: true }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
            preserveSelectedRowKeys: true,
          }}
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

      <Modal
        title={`Bulk edit (${selectedRowKeys.length} selected)`}
        open={bulkModalOpen}
        onCancel={closeBulkModal}
        onOk={() => void submitBulk()}
        confirmLoading={bulkSaving}
        destroyOnClose
        width={480}
        okText="Apply to selected"
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Only fields you change are applied. Leave a field untouched to keep each product’s current value.
        </Typography.Paragraph>
        <Form<BulkFormValues> form={bulkForm} layout="vertical">
          <Form.Item name="bulkCategoryId" label="Category">
            <Select
              allowClear
              placeholder="Leave unchanged"
              options={categoryOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="bulkSize" label="Size">
            <AutoComplete
              allowClear
              placeholder="Leave unchanged"
              options={sizeSuggestions}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="bulkPriceDollars" label="Price (USD)" extra="Only applied if you edit this field.">
            <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} placeholder="Leave unchanged" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
