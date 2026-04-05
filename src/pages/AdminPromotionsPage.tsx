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
import { fetchAllProducts } from '../api/fetchAllProducts'
import {
  createPromotion,
  deletePromotion,
  listPromotionsAdmin,
  setPromotionActive,
  updatePromotion,
  type PromotionInput,
  type PromotionTierInput,
} from '../api/promotionsAdmin'
import type { Product, Promotion, PromotionKind } from '../types/pos'

const { Title, Text } = Typography

const KIND_OPTIONS: { value: PromotionKind; label: string }[] = [
  { value: 'BUY_X_GET_Y', label: 'Buy X get Y free' },
  { value: 'BULK_DISCOUNT', label: 'Bulk discount' },
  { value: 'SINGLE_DISCOUNT', label: 'Single product discount' },
  { value: 'TIERED', label: 'Tiered (multiple rules)' },
]

function promotionSummary(p: Promotion): string {
  switch (p.kind) {
    case 'BUY_X_GET_Y':
      return `Buy ${p.buyQty ?? '—'} get ${p.freeQty ?? '—'} free`
    case 'BULK_DISCOUNT':
      return `≥${p.buyQty ?? '—'} units → ${p.discountPercent ?? 0}% off`
    case 'SINGLE_DISCOUNT':
      return `${p.discountPercent ?? 0}% off selected SKU(s)`
    case 'TIERED':
      return `${p.rules.length} tier(s) — best match applies`
    default:
      return '—'
  }
}

type TierFormRow = {
  min_qty: number
  free_qty?: number | null
  discount_percent?: number | null
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
  tiers?: TierFormRow[]
}

function buildTierInputs(rows: TierFormRow[]): PromotionTierInput[] {
  return rows.map((t, i) => {
    const minQty = t.min_qty
    const fq = t.free_qty
    const dp = t.discount_percent
    const hasFree = fq != null && fq >= 1
    const hasPct = dp != null && dp >= 1 && dp <= 100
    if (minQty < 1) throw new Error(`Tier ${i + 1}: min qty must be ≥ 1`)
    if (hasFree === hasPct) {
      throw new Error(`Tier ${i + 1}: set either free qty OR discount %`)
    }
    if (hasFree) {
      return { minQty, freeQty: fq!, discountPercent: null, sortOrder: i }
    }
    return { minQty, freeQty: null, discountPercent: dp!, sortOrder: i }
  })
}

function toInput(values: FormValues): PromotionInput {
  const tiers: PromotionTierInput[] =
    values.kind === 'TIERED' ? buildTierInputs(values.tiers ?? []) : []
  return {
    code: values.code?.trim() ? values.code.trim() : null,
    name: values.name.trim(),
    kind: values.kind,
    buyQty: values.buyQty ?? null,
    freeQty: values.freeQty ?? null,
    discountPercent: values.discountPercent ?? null,
    active: values.active,
    productIds: values.productIds ?? [],
    tiers,
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
      tiers: [],
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
      tiers:
        p.kind === 'TIERED'
          ? p.rules.map((r) => ({
              min_qty: r.minQty,
              free_qty: r.freeQty ?? undefined,
              discount_percent: r.discountPercent ?? undefined,
            }))
          : [],
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
      if (values.kind === 'TIERED' && (!values.tiers || values.tiers.length === 0)) {
        message.error('Add at least one tier')
        return
      }
      let input: PromotionInput
      try {
        input = toInput(values)
      } catch (err) {
        message.error(err instanceof Error ? err.message : 'Invalid tiers')
        return
      }
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
    <div className="admin-page admin-promotions">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>
            Promotion Management
          </Title>
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
        width={640}
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
                  tiers: [],
                })
              } else if (k === 'BULK_DISCOUNT') {
                form.setFieldsValue({
                  buyQty: form.getFieldValue('buyQty') ?? 2,
                  freeQty: null,
                  discountPercent: form.getFieldValue('discountPercent') ?? 15,
                  tiers: [],
                })
              } else if (k === 'TIERED') {
                const cur = form.getFieldValue('tiers') as TierFormRow[] | undefined
                if (!cur?.length) {
                  form.setFieldsValue({
                    buyQty: null,
                    freeQty: null,
                    discountPercent: null,
                    tiers: [
                      { min_qty: 6, free_qty: 1 },
                      { min_qty: 10, free_qty: 2 },
                    ],
                  })
                } else {
                  form.setFieldsValue({
                    buyQty: null,
                    freeQty: null,
                    discountPercent: null,
                  })
                }
              } else {
                form.setFieldsValue({
                  buyQty: null,
                  freeQty: null,
                  discountPercent: form.getFieldValue('discountPercent') ?? 10,
                  tiers: [],
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

          {kindWatch === 'TIERED' && (
            <Form.Item label="Tiers (best matching rule wins)">
              <Form.List name="tiers">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    {fields.map((field) => (
                      <Space key={field.key} wrap style={{ width: '100%' }}>
                        <Form.Item
                          name={[field.name, 'min_qty']}
                          rules={[{ required: true, type: 'number', min: 1 }]}
                          style={{ marginBottom: 0, width: 120 }}
                        >
                          <InputNumber min={1} placeholder="Min qty" style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'free_qty']}
                          style={{ marginBottom: 0, width: 120 }}
                        >
                          <InputNumber min={1} placeholder="Free qty" style={{ width: '100%' }} />
                        </Form.Item>
                        <Text type="secondary">or</Text>
                        <Form.Item
                          name={[field.name, 'discount_percent']}
                          style={{ marginBottom: 0, width: 120 }}
                        >
                          <InputNumber
                            min={1}
                            max={100}
                            placeholder="% off"
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                        <Button type="text" danger onClick={() => remove(field.name)}>
                          Remove
                        </Button>
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add({ min_qty: 1 })} block>
                      Add tier
                    </Button>
                  </Space>
                )}
              </Form.List>
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
