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
import { listGiftsAdmin, type AdminGift } from '../api/giftsAdmin'
import {
  createPromotion,
  deletePromotion,
  listPromotionsAdmin,
  setPromotionActive,
  updatePromotion,
  type PromotionInput,
  type PromotionTierInput,
} from '../api/promotionsAdmin'
import { formatMoney } from '../lib/money'
import { zhtw } from '../locales/zhTW'
import type { Product, Promotion, PromotionApplyMode, PromotionKind } from '../types/pos'

const { Title, Text } = Typography
const pr = zhtw.admin.promotions
const common = zhtw.common

function dollarsToCents(d: number): number {
  return Math.round(d * 100)
}

function centsToDollars(c: number): number {
  return c / 100
}

const KIND_OPTIONS: { value: PromotionKind; label: string }[] = [
  { value: 'BUY_X_GET_Y', label: pr.kindBogo },
  { value: 'BULK_DISCOUNT', label: pr.kindBulk },
  { value: 'SINGLE_DISCOUNT', label: pr.kindSingle },
  { value: 'TIERED', label: pr.kindTiered },
  { value: 'GIFT_WITH_THRESHOLD', label: pr.kindThreshold },
  { value: 'FIXED_DISCOUNT', label: pr.kindFixed },
  { value: 'FREE_ITEMS', label: pr.kindFreeItems },
  { value: 'FREE_PRODUCT', label: pr.kindFreeProduct },
]

function promotionSummary(p: Promotion): string {
  const dash = common.dash
  switch (p.kind) {
    case 'BUY_X_GET_Y':
      return pr.summaryBogo(String(p.buyQty ?? dash), String(p.freeQty ?? dash))
    case 'BULK_DISCOUNT':
      return pr.summaryBulk(String(p.buyQty ?? dash), p.discountPercent ?? 0)
    case 'SINGLE_DISCOUNT':
      return pr.summarySingle(p.discountPercent ?? 0)
    case 'TIERED':
      return pr.summaryTiered(p.rules.length)
    case 'GIFT_WITH_THRESHOLD':
      return pr.summaryThreshold(formatMoney(p.thresholdAmountCents ?? 0), p.gift?.displayName ?? dash)
    case 'FIXED_DISCOUNT':
      return pr.summaryFixed(formatMoney(p.fixedDiscountCents ?? 0))
    case 'FREE_ITEMS':
    case 'FREE_PRODUCT':
      return pr.summaryFreeUnits(p.freeQty ?? 0)
    default:
      return dash
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
  applyMode: PromotionApplyMode
  buyQty?: number | null
  freeQty?: number | null
  discountPercent?: number | null
  fixedDiscountDollars?: number | null
  active: boolean
  productIds: string[]
  tiers?: TierFormRow[]
  promotionGiftId?: string
  thresholdDollars?: number | null
}

function buildTierInputs(rows: TierFormRow[]): PromotionTierInput[] {
  return rows.map((t, i) => {
    const minQty = t.min_qty
    const fq = t.free_qty
    const dp = t.discount_percent
    const hasFree = fq != null && fq >= 1
    const hasPct = dp != null && dp >= 1 && dp <= 100
    if (minQty < 1) throw new Error(pr.tierMinError(i + 1))
    if (hasFree === hasPct) {
      throw new Error(pr.tierExclusiveError(i + 1))
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
  const code = values.code?.trim() ? values.code.trim() : null
  const name = values.name.trim()

  if (values.kind === 'GIFT_WITH_THRESHOLD') {
    return {
      code,
      name,
      kind: values.kind,
      buyQty: null,
      freeQty: null,
      discountPercent: null,
      active: values.active,
      applyMode: 'AUTO',
      fixedDiscountCents: null,
      productIds: [],
      tiers: [],
      giftId: values.promotionGiftId ?? null,
      thresholdAmountCents: dollarsToCents(Number(values.thresholdDollars)),
    }
  }

  const applyMode = values.applyMode ?? 'AUTO'

  if (values.kind === 'FIXED_DISCOUNT') {
    return {
      code,
      name,
      kind: values.kind,
      buyQty: null,
      freeQty: null,
      discountPercent: null,
      active: values.active,
      applyMode,
      fixedDiscountCents: dollarsToCents(Number(values.fixedDiscountDollars)),
      productIds: [],
      tiers: [],
      giftId: null,
      thresholdAmountCents: null,
    }
  }

  if (values.kind === 'FREE_ITEMS' || values.kind === 'FREE_PRODUCT') {
    return {
      code,
      name,
      kind: values.kind,
      buyQty: null,
      freeQty: values.freeQty ?? null,
      discountPercent: null,
      active: values.active,
      applyMode,
      fixedDiscountCents: null,
      productIds: values.productIds ?? [],
      tiers: [],
      giftId: null,
      thresholdAmountCents: null,
    }
  }

  if (values.kind === 'TIERED') {
    return {
      code,
      name,
      kind: values.kind,
      buyQty: null,
      freeQty: null,
      discountPercent: null,
      active: values.active,
      applyMode,
      fixedDiscountCents: null,
      productIds: values.productIds ?? [],
      tiers,
      giftId: null,
      thresholdAmountCents: null,
    }
  }

  return {
    code,
    name,
    kind: values.kind,
    buyQty: values.buyQty ?? null,
    freeQty: values.freeQty ?? null,
    discountPercent: values.discountPercent ?? null,
    active: values.active,
    applyMode,
    fixedDiscountCents: null,
    productIds: values.productIds ?? [],
    tiers,
    giftId: null,
    thresholdAmountCents: null,
  }
}

export function AdminPromotionsPage() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [products, setProducts] = useState<Product[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [gifts, setGifts] = useState<AdminGift[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const kindWatch = Form.useWatch('kind', form)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [plist, mlist, glist] = await Promise.all([
        fetchAllProducts(),
        listPromotionsAdmin(),
        listGiftsAdmin(),
      ])
      setProducts(plist)
      setPromotions(mlist)
      setGifts(glist)
    } catch (e) {
      message.error(e instanceof Error ? e.message : pr.loadError)
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
      applyMode: 'AUTO',
      buyQty: 2,
      freeQty: null,
      discountPercent: 15,
      fixedDiscountDollars: undefined,
      active: true,
      productIds: [],
      tiers: [],
      promotionGiftId: undefined,
      thresholdDollars: undefined,
    })
    setModalOpen(true)
  }

  const openEdit = (p: Promotion) => {
    setEditingId(p.id)
    form.setFieldsValue({
      name: p.name,
      code: p.code ?? '',
      kind: p.kind,
      applyMode: p.kind === 'GIFT_WITH_THRESHOLD' ? 'AUTO' : p.applyMode,
      buyQty: p.buyQty,
      freeQty: p.freeQty,
      discountPercent: p.discountPercent,
      fixedDiscountDollars:
        p.kind === 'FIXED_DISCOUNT' && p.fixedDiscountCents != null
          ? centsToDollars(p.fixedDiscountCents)
          : undefined,
      active: p.active,
      productIds: p.kind === 'GIFT_WITH_THRESHOLD' || p.kind === 'FIXED_DISCOUNT' ? [] : p.productIds,
      tiers:
        p.kind === 'TIERED'
          ? p.rules.map((r) => ({
              min_qty: r.minQty,
              free_qty: r.freeQty ?? undefined,
              discount_percent: r.discountPercent ?? undefined,
            }))
          : [],
      promotionGiftId: p.giftId ?? undefined,
      thresholdDollars:
        p.kind === 'GIFT_WITH_THRESHOLD' && p.thresholdAmountCents != null
          ? centsToDollars(p.thresholdAmountCents)
          : undefined,
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
        message.error(pr.addTierError)
        return
      }
      if (values.kind === 'GIFT_WITH_THRESHOLD') {
        if (!values.promotionGiftId) {
          message.error(pr.selectGiftError)
          return
        }
        if (values.thresholdDollars == null || Number(values.thresholdDollars) <= 0) {
          message.error(pr.thresholdError)
          return
        }
      }
      if (values.kind === 'FIXED_DISCOUNT') {
        if (values.fixedDiscountDollars == null || Number(values.fixedDiscountDollars) <= 0) {
          message.error(pr.fixedDiscountError)
          return
        }
      }
      if (values.kind === 'FREE_ITEMS' || values.kind === 'FREE_PRODUCT') {
        if (!values.productIds?.length) {
          message.error(pr.selectProductError)
          return
        }
        if (values.freeQty == null || values.freeQty < 1) {
          message.error(pr.freeQtyError)
          return
        }
      }
      let input: PromotionInput
      try {
        input = toInput(values)
      } catch (err) {
        message.error(err instanceof Error ? err.message : pr.invalidTiers)
        return
      }
      if (
        input.kind !== 'GIFT_WITH_THRESHOLD' &&
        input.kind !== 'FIXED_DISCOUNT' &&
        input.productIds.length === 0
      ) {
        message.error(pr.selectProductError)
        return
      }
      if (
        input.kind === 'GIFT_WITH_THRESHOLD' &&
        (!input.thresholdAmountCents || input.thresholdAmountCents < 1)
      ) {
        message.error(pr.thresholdError)
        return
      }
      if (
        input.kind === 'FIXED_DISCOUNT' &&
        (!input.fixedDiscountCents || input.fixedDiscountCents < 1)
      ) {
        message.error(pr.fixedDiscountError)
        return
      }
      setSaving(true)
      if (editingId) {
        await updatePromotion(editingId, input)
        message.success(pr.updated)
      } else {
        await createPromotion(input)
        message.success(pr.created)
      }
      closeModal()
      await load()
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof Error ? e.message : pr.saveError)
    } finally {
      setSaving(false)
    }
  }

  const onDelete = (p: Promotion) => {
    modal.confirm({
      title: pr.deleteTitle,
      content: pr.deleteBody(p.name),
      okText: common.delete,
      okButtonProps: { danger: true },
      onOk: async () => {
        await deletePromotion(p.id)
        message.success(pr.deleted)
        await load()
      },
    })
  }

  const onToggleActive = async (p: Promotion, active: boolean) => {
    try {
      await setPromotionActive(p.id, active)
      message.success(active ? pr.activated : pr.deactivated)
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : pr.updateError)
    }
  }

  const productOptions = products.map((pr) => ({
    label: `${pr.name}${pr.size ? ` (${pr.size})` : ''} · ${pr.sku}`,
    value: pr.id,
  }))

  const giftOptions = gifts.map((x) => ({
    label: `${x.name}${x.product ? ` · ${x.product.sku}` : ''}`,
    value: x.id,
  }))

  const columns: ColumnsType<Promotion> = [
    {
      title: pr.colName,
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
      title: pr.colApplyMode,
      key: 'apply',
      width: 88,
      render: (_, row) => (
        <Tag color={row.applyMode === 'MANUAL' ? 'gold' : 'default'}>
          {row.kind === 'GIFT_WITH_THRESHOLD' ? pr.applyAuto : row.applyMode === 'MANUAL' ? pr.applyManual : pr.applyAuto}
        </Tag>
      ),
    },
    {
      title: pr.colType,
      dataIndex: 'kind',
      key: 'kind',
      width: 160,
      render: (k: PromotionKind) => <Tag>{KIND_OPTIONS.find((o) => o.value === k)?.label ?? k}</Tag>,
    },
    {
      title: pr.colRule,
      key: 'rule',
      render: (_, row) => promotionSummary(row),
    },
    {
      title: pr.colProducts,
      key: 'pc',
      width: 72,
      align: 'center',
      render: (_, row) =>
        row.kind === 'GIFT_WITH_THRESHOLD' || row.kind === 'FIXED_DISCOUNT'
          ? common.dash
          : row.productIds.length,
    },
    {
      title: pr.colActive,
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
            {common.edit}
          </Button>
          <Button type="link" size="small" danger onClick={() => onDelete(row)}>
            {common.delete}
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
            {pr.pageTitle}
          </Title>
          <Button type="primary" onClick={openCreate}>
            {pr.newPromotion}
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
        title={editingId ? pr.modalEdit : pr.modalCreate}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void submit()}
        confirmLoading={saving}
        destroyOnClose
        width={640}
        okText={common.save}
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
              } else if (k === 'GIFT_WITH_THRESHOLD') {
                form.setFieldsValue({
                  buyQty: null,
                  freeQty: null,
                  discountPercent: null,
                  tiers: [],
                  productIds: [],
                  applyMode: 'AUTO',
                  thresholdDollars: form.getFieldValue('thresholdDollars') ?? 500,
                })
              } else if (k === 'FIXED_DISCOUNT') {
                form.setFieldsValue({
                  buyQty: null,
                  freeQty: null,
                  discountPercent: null,
                  tiers: [],
                  productIds: [],
                  applyMode: 'MANUAL',
                  fixedDiscountDollars: form.getFieldValue('fixedDiscountDollars') ?? 50,
                })
              } else if (k === 'FREE_ITEMS') {
                form.setFieldsValue({
                  buyQty: null,
                  discountPercent: null,
                  tiers: [],
                  applyMode: 'MANUAL',
                  freeQty: form.getFieldValue('freeQty') ?? 20,
                })
              } else if (k === 'FREE_PRODUCT') {
                form.setFieldsValue({
                  buyQty: null,
                  discountPercent: null,
                  tiers: [],
                  applyMode: 'MANUAL',
                  freeQty: form.getFieldValue('freeQty') ?? 1,
                })
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
          <Form.Item name="name" label={pr.labelName} rules={[{ required: true, message: common.required }]}>
            <Input placeholder={pr.namePh} />
          </Form.Item>
          <Form.Item name="code" label={pr.labelCode}>
            <Input placeholder={pr.codePh} />
          </Form.Item>
          <Form.Item name="kind" label={pr.labelKind} rules={[{ required: true }]}>
            <Select
              options={KIND_OPTIONS}
              optionFilterProp="label"
              placeholder={pr.kindPh}
            />
          </Form.Item>

          {kindWatch && kindWatch !== 'GIFT_WITH_THRESHOLD' ? (
            <Form.Item name="applyMode" label={pr.labelApplyMode} rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'AUTO', label: pr.applyAuto },
                  { value: 'MANUAL', label: pr.applyManual },
                ]}
              />
            </Form.Item>
          ) : null}

          {kindWatch === 'BUY_X_GET_Y' && (
            <Space size="middle" style={{ display: 'flex' }}>
              <Form.Item
                name="buyQty"
                label={pr.buyX}
                rules={[{ required: true, type: 'number', min: 1 }]}
                style={{ flex: 1 }}
              >
                <InputNumber min={1} style={{ width: '100%' }} placeholder={pr.phX} />
              </Form.Item>
              <Form.Item
                name="freeQty"
                label={pr.freeY}
                rules={[{ required: true, type: 'number', min: 1 }]}
                style={{ flex: 1 }}
              >
                <InputNumber min={1} style={{ width: '100%' }} placeholder={pr.phY} />
              </Form.Item>
            </Space>
          )}

          {kindWatch === 'BULK_DISCOUNT' && (
            <Space size="middle" style={{ display: 'flex' }}>
              <Form.Item
                name="buyQty"
                label={pr.minUnits}
                rules={[{ required: true, type: 'number', min: 1 }]}
                style={{ flex: 1 }}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name="discountPercent"
                label={pr.discountPct}
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
              label={pr.discountPct}
              rules={[{ required: true, type: 'number', min: 1, max: 100 }]}
            >
              <InputNumber min={1} max={100} style={{ width: '100%' }} />
            </Form.Item>
          )}

          {kindWatch === 'TIERED' && (
            <Form.Item label={pr.tiersLabel}>
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
                          <InputNumber min={1} placeholder={pr.minQty} style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'free_qty']}
                          style={{ marginBottom: 0, width: 120 }}
                        >
                          <InputNumber min={1} placeholder={pr.freeQty} style={{ width: '100%' }} />
                        </Form.Item>
                        <Text type="secondary">{pr.or}</Text>
                        <Form.Item
                          name={[field.name, 'discount_percent']}
                          style={{ marginBottom: 0, width: 120 }}
                        >
                          <InputNumber
                            min={1}
                            max={100}
                            placeholder={pr.pctOff}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                        <Button type="text" danger onClick={() => remove(field.name)}>
                          {pr.removeTier}
                        </Button>
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add({ min_qty: 1 })} block>
                      {pr.addTier}
                    </Button>
                  </Space>
                )}
              </Form.List>
            </Form.Item>
          )}

          {kindWatch === 'GIFT_WITH_THRESHOLD' ? (
            <>
              <Form.Item
                name="promotionGiftId"
                label={pr.labelGift}
                rules={[{ required: true, message: pr.selectGiftError }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={pr.giftPh}
                  options={giftOptions}
                />
              </Form.Item>
              <Form.Item
                name="thresholdDollars"
                label={pr.labelThreshold}
                rules={[{ required: true, type: 'number', min: 0.01 }]}
                extra={pr.thresholdExtra}
              >
                <InputNumber min={0.01} step={1} style={{ width: '100%' }} placeholder={pr.thresholdPh} />
              </Form.Item>
            </>
          ) : kindWatch === 'FIXED_DISCOUNT' ? (
            <Form.Item
              name="fixedDiscountDollars"
              label={pr.labelFixedDiscount}
              rules={[{ required: true, type: 'number', min: 0.01 }]}
              extra={pr.fixedDiscountExtra}
            >
              <InputNumber min={0.01} step={1} style={{ width: '100%' }} placeholder={pr.fixedDiscountPh} />
            </Form.Item>
          ) : (
            <>
              {(kindWatch === 'FREE_ITEMS' || kindWatch === 'FREE_PRODUCT') && (
                <Form.Item
                  name="freeQty"
                  label={kindWatch === 'FREE_ITEMS' ? pr.labelFreeQtyItems : pr.labelFreeQtyProduct}
                  rules={[{ required: true, type: 'number', min: 1 }]}
                >
                  <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                </Form.Item>
              )}
              <Form.Item
                name="productIds"
                label={pr.labelProducts}
                rules={[
                  ({ getFieldValue }) => ({
                    validator: async (_, v: string[]) => {
                      const k = getFieldValue('kind') as PromotionKind
                      if (k === 'GIFT_WITH_THRESHOLD' || k === 'FIXED_DISCOUNT') return
                      if (!v?.length) throw new Error(pr.validatorProducts)
                    },
                  }),
                ]}
              >
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder={pr.productsPh}
                  options={productOptions}
                />
              </Form.Item>
            </>
          )}

          <Form.Item name="active" label={pr.colActive} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
