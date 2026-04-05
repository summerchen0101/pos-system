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
import { Link } from 'react-router-dom'
import { fetchAllProducts } from '../api/fetchAllProducts'
import {
  createPromotion,
  deletePromotion,
  listPromotionsAdmin,
  setPromotionActive,
  updatePromotion,
  type PromotionInput,
} from '../api/promotionsAdmin'
import type { Product, Promotion, PromotionKind } from '../types/pos'

const { Title, Text } = Typography

const KIND_OPTIONS: { value: PromotionKind; label: string }[] = [
  { value: 'BUY_X_GET_Y', label: 'Buy X get Y free' },
  { value: 'BULK_DISCOUNT', label: 'Bulk discount' },
  { value: 'SINGLE_DISCOUNT', label: 'Single product discount' },
]

function promotionSummary(p: Promotion): string {
  switch (p.kind) {
    case 'BUY_X_GET_Y':
      return `Buy ${p.buyQty ?? '—'} get ${p.freeQty ?? '—'} free`
    case 'BULK_DISCOUNT':
      return `≥${p.buyQty ?? '—'} units → ${p.discountPercent ?? 0}% off`
    case 'SINGLE_DISCOUNT':
      return `${p.discountPercent ?? 0}% off selected SKU(s)`
    default:
      return '—'
  }
}

type FormValues = {
  code?: string
  name: string
  kind: PromotionKind
  buyQty?: number | null
  freeQty?: number | null
  discountPercent?: number | null
  active: boolean
  productIds: string[]
}

function toInput(values: FormValues): PromotionInput {
  return {
    code: values.code?.trim() ? values.code.trim() : null,
    name: values.name.trim(),
    kind: values.kind,
    buyQty: values.buyQty ?? null,
    freeQty: values.freeQty ?? null,
    discountPercent: values.discountPercent ?? null,
    active: values.active,
    productIds: values.productIds ?? [],
  }
}

export function AdminPromotionsPage() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [products, setProducts] = useState<Product[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const kindWatch = Form.useWatch('kind', form)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [plist, mlist] = await Promise.all([fetchAllProducts(), listPromotionsAdmin()])
      setProducts(plist)
      setPromotions(mlist)
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
      code: '',
      kind: 'BULK_DISCOUNT',
      buyQty: 2,
      freeQty: null,
      discountPercent: 15,
      active: true,
      productIds: [],
    })
    setModalOpen(true)
  }

  const openEdit = (p: Promotion) => {
    setEditingId(p.id)
    form.setFieldsValue({
      name: p.name,
      code: p.code ?? '',
      kind: p.kind,
      buyQty: p.buyQty,
      freeQty: p.freeQty,
      discountPercent: p.discountPercent,
      active: p.active,
      productIds: p.productIds,
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
      if (input.productIds.length === 0) {
        message.error('Select at least one product')
        return
      }
      setSaving(true)
      if (editingId) {
        await updatePromotion(editingId, input)
        message.success('Promotion updated')
      } else {
        await createPromotion(input)
        message.success('Promotion created')
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

  const onDelete = (p: Promotion) => {
    modal.confirm({
      title: 'Delete promotion?',
      content: `“${p.name}” will be removed.`,
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        await deletePromotion(p.id)
        message.success('Deleted')
        await load()
      },
    })
  }

  const onToggleActive = async (p: Promotion, active: boolean) => {
    try {
      await setPromotionActive(p.id, active)
      message.success(active ? 'Activated' : 'Deactivated')
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const productOptions = products.map((pr) => ({
    label: `${pr.name}${pr.size ? ` (${pr.size})` : ''} · ${pr.sku}`,
    value: pr.id,
  }))

  const columns: ColumnsType<Promotion> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {row.code ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.code}
            </Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'kind',
      key: 'kind',
      width: 160,
      render: (k: PromotionKind) => <Tag>{KIND_OPTIONS.find((o) => o.value === k)?.label ?? k}</Tag>,
    },
    {
      title: 'Rule',
      key: 'rule',
      render: (_, row) => promotionSummary(row),
    },
    {
      title: 'Products',
      key: 'pc',
      width: 72,
      align: 'center',
      render: (_, row) => row.productIds.length,
    },
    {
      title: 'Active',
      dataIndex: 'active',
      key: 'active',
      width: 100,
      render: (active: boolean, row) => (
        <Switch checked={active} onChange={(v) => void onToggleActive(row, v)} />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 160,
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
    <div className="admin-promotions">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space align="center">
            <Title level={3} style={{ margin: 0 }}>
              Promotions
            </Title>
            <Link to="/">← Register</Link>
          </Space>
          <Button type="primary" onClick={openCreate}>
            New promotion
          </Button>
        </Space>

        <Card>
          <Table<Promotion>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={promotions}
            pagination={{ pageSize: 10 }}
          />
        </Card>
      </Space>

      <Modal
        title={editingId ? 'Edit promotion' : 'Create promotion'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void submit()}
        confirmLoading={saving}
        destroyOnClose
        width={560}
        okText="Save"
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          style={{ marginTop: 8 }}
          onValuesChange={(changed) => {
            if ('kind' in changed) {
              const k = changed.kind as PromotionKind
              if (k === 'BUY_X_GET_Y') {
                form.setFieldsValue({
                  buyQty: form.getFieldValue('buyQty') ?? 2,
                  freeQty: form.getFieldValue('freeQty') ?? 1,
                  discountPercent: null,
                })
              } else if (k === 'BULK_DISCOUNT') {
                form.setFieldsValue({
                  buyQty: form.getFieldValue('buyQty') ?? 2,
                  freeQty: null,
                  discountPercent: form.getFieldValue('discountPercent') ?? 15,
                })
              } else {
                form.setFieldsValue({
                  buyQty: null,
                  freeQty: null,
                  discountPercent: form.getFieldValue('discountPercent') ?? 10,
                })
              }
            }
          }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. Summer latte deal" />
          </Form.Item>
          <Form.Item name="code" label="Code (optional)">
            <Input placeholder="Internal reference" />
          </Form.Item>
          <Form.Item name="kind" label="Promotion type" rules={[{ required: true }]}>
            <Select
              options={KIND_OPTIONS}
              optionFilterProp="label"
              placeholder="Select type"
            />
          </Form.Item>

          {kindWatch === 'BUY_X_GET_Y' && (
            <Space size="middle" style={{ display: 'flex' }}>
              <Form.Item
                name="buyQty"
                label="Buy quantity (X)"
                rules={[{ required: true, type: 'number', min: 1 }]}
                style={{ flex: 1 }}
              >
                <InputNumber min={1} style={{ width: '100%' }} placeholder="X" />
              </Form.Item>
              <Form.Item
                name="freeQty"
                label="Free quantity (Y)"
                rules={[{ required: true, type: 'number', min: 1 }]}
                style={{ flex: 1 }}
              >
                <InputNumber min={1} style={{ width: '100%' }} placeholder="Y" />
              </Form.Item>
            </Space>
          )}

          {kindWatch === 'BULK_DISCOUNT' && (
            <Space size="middle" style={{ display: 'flex' }}>
              <Form.Item
                name="buyQty"
                label="Min units in cart"
                rules={[{ required: true, type: 'number', min: 1 }]}
                style={{ flex: 1 }}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="discountPercent"
                label="Discount %"
                rules={[{ required: true, type: 'number', min: 1, max: 100 }]}
                style={{ flex: 1 }}
              >
                <InputNumber min={1} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Space>
          )}

          {kindWatch === 'SINGLE_DISCOUNT' && (
            <Form.Item
              name="discountPercent"
              label="Discount %"
              rules={[{ required: true, type: 'number', min: 1, max: 100 }]}
            >
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
          )}

          <Form.Item
            name="productIds"
            label="Applicable products"
            rules={[
              {
                validator: async (_, v: string[]) => {
                  if (!v?.length) throw new Error('Select at least one product')
                },
              },
            ]}
          >
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Select products"
              options={productOptions}
            />
          </Form.Item>

          <Form.Item name="active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
