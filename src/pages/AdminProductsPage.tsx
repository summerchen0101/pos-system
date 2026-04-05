import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import {
  App,
  AutoComplete,
  Button,
  Card,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useCallback, useEffect, useMemo, useState, type Key } from 'react'
import { listCategoriesAdmin } from '../api/categoriesAdmin'
import {
  bulkPatchProducts,
  createProduct,
  deleteProduct,
  listDistinctProductSizes,
  listProductsAdmin,
  updateProduct,
  type ProductBulkPatch,
  type ProductInput,
  type ProductListFilters,
} from '../api/productsAdmin'
import { zhtw } from '../locales/zhTW'
import { formatMoney } from '../lib/money'
import type { Category, Product, ProductKind } from '../types/pos'

const { Title, Text } = Typography
const p = zhtw.admin.products
const common = zhtw.common

type BundleOptionFormRow = {
  productId?: string
  qty?: number
}

type FormValues = {
  categoryId?: string | null
  name: string
  nameEn?: string
  description?: string
  size?: string
  sku: string
  priceDollars: number
  stock: number
  isActive: boolean
  productKind: ProductKind
  bundleTotalQty?: number
  bundleOptions?: BundleOptionFormRow[]
}

type BulkStockMode = 'set' | 'adjust'

type BulkFormValues = {
  bulkCategoryId?: string | null
  bulkSize?: string
  bulkPriceDollars?: number | null
  bulkStockMode?: BulkStockMode
  bulkStockValue?: number | null
}

type FilterFormValues = {
  filterName?: string
  filterSku?: string
  filterSize?: string
  filterCategoryId?: string
}

function dollarsToCents(d: number): number {
  return Math.round(d * 100)
}

function centsToDollars(c: number): number {
  return Math.round(c) / 100
}

function toInput(values: FormValues): ProductInput {
  const kind = values.productKind ?? 'STANDARD'
  const bundleOptions =
    kind === 'CUSTOM_BUNDLE'
      ? (values.bundleOptions ?? [])
          .filter((r) => r?.productId)
          .map((r) => ({
            productId: r.productId!,
            quantity: Math.max(1, Math.trunc(Number(r.qty) || 1)),
          }))
      : []
  return {
    categoryId: values.categoryId ?? null,
    name: values.name,
    nameEn: values.nameEn?.trim() ? values.nameEn.trim() : null,
    description: values.description?.trim() ? values.description.trim() : null,
    size: values.size?.trim() ? values.size.trim() : null,
    sku: values.sku,
    priceCents: dollarsToCents(values.priceDollars),
    stock: Math.max(0, Math.floor(Number(values.stock) || 0)),
    isActive: values.isActive,
    kind,
    bundleTotalQty: kind === 'CUSTOM_BUNDLE' ? Math.max(1, Math.trunc(Number(values.bundleTotalQty) || 0)) : null,
    bundleOptions,
  }
}

export function AdminProductsPage() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [bulkForm] = Form.useForm<BulkFormValues>()
  const [filterForm] = Form.useForm<FilterFormValues>()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [sizeOptions, setSizeOptions] = useState<string[]>([])
  const [debouncedName, setDebouncedName] = useState('')
  const [debouncedSku, setDebouncedSku] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])

  const categoryOptions = categories.map((c) => ({ label: c.name, value: c.id }))
  const sizeFilterOptions = useMemo(
    () => sizeOptions.map((s) => ({ label: s, value: s })),
    [sizeOptions],
  )
  const sizeSuggestions = useMemo(() => sizeOptions.map((value) => ({ value })), [sizeOptions])

  const watchFilterName = Form.useWatch('filterName', filterForm)
  const watchFilterSku = Form.useWatch('filterSku', filterForm)
  const watchFilterSize = Form.useWatch('filterSize', filterForm)
  const watchFilterCategoryId = Form.useWatch('filterCategoryId', filterForm)
  const bulkStockMode = (Form.useWatch('bulkStockMode', bulkForm) ?? 'set') as BulkStockMode
  const productKindWatch = Form.useWatch('productKind', form) as ProductKind | undefined

  const componentProductOptions = useMemo(() => {
    return products
      .filter((x) => x.kind === 'STANDARD')
      .filter((x) => !editingId || x.id !== editingId)
      .map((x) => ({
        label: `${x.name}${x.size ? ` (${x.size})` : ''} · ${x.sku}`,
        value: x.id,
      }))
  }, [products, editingId])

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedName(typeof watchFilterName === 'string' ? watchFilterName.trim() : '')
      setDebouncedSku(typeof watchFilterSku === 'string' ? watchFilterSku.trim() : '')
    }, 300)
    return () => window.clearTimeout(id)
  }, [watchFilterName, watchFilterSku])

  const listFilters = useMemo((): ProductListFilters => {
    const size =
      typeof watchFilterSize === 'string' && watchFilterSize.trim()
        ? watchFilterSize.trim()
        : undefined
    const categoryId =
      typeof watchFilterCategoryId === 'string' && watchFilterCategoryId
        ? watchFilterCategoryId
        : undefined
    return {
      name: debouncedName || undefined,
      sku: debouncedSku || undefined,
      size,
      categoryId,
    }
  }, [debouncedName, debouncedSku, watchFilterSize, watchFilterCategoryId])

  const refetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const plist = await listProductsAdmin(listFilters)
      setProducts(plist)
    } catch (e) {
      message.error(e instanceof Error ? e.message : p.loadProductsError)
    } finally {
      setLoading(false)
    }
  }, [listFilters, message])

  useEffect(() => {
    void refetchProducts()
  }, [refetchProducts])

  useEffect(() => {
    let cancelled = false
    void Promise.all([listCategoriesAdmin(), listDistinctProductSizes()])
      .then(([cats, sizes]) => {
        if (!cancelled) {
          setCategories(cats)
          setSizeOptions(sizes)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          message.error(e instanceof Error ? e.message : p.loadCategoriesError)
        }
      })
    return () => {
      cancelled = true
    }
  }, [message])

  const resetFilters = () => {
    filterForm.resetFields()
    setDebouncedName('')
    setDebouncedSku('')
  }

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
      stock: 0,
      isActive: true,
      categoryId: categoryOptions[0]?.value,
      productKind: 'STANDARD',
      bundleTotalQty: 1,
      bundleOptions: [],
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
      stock: p.stock,
      isActive: p.isActive,
      productKind: p.kind,
      bundleTotalQty: p.bundleTotalQty ?? 1,
      bundleOptions:
        p.kind === 'CUSTOM_BUNDLE' && p.bundleOptions.length > 0
          ? p.bundleOptions.map((o) => ({ productId: o.productId, qty: o.quantity }))
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
      if (values.productKind === 'CUSTOM_BUNDLE') {
        const total = values.bundleTotalQty
        if (total == null || Number(total) < 1) {
          message.error(p.bundleTotalQtyError)
          return
        }
        const rows = (values.bundleOptions ?? []).filter((r) => r?.productId)
        if (rows.length === 0) {
          message.error(p.bundleOptionsRequired)
          return
        }
        const ids = rows.map((r) => r.productId as string)
        if (new Set(ids).size !== ids.length) {
          message.error(p.bundleDuplicateProduct)
          return
        }
        if (editingId && ids.includes(editingId)) {
          message.error(p.bundleCannotIncludeSelf)
          return
        }
      }
      const input = toInput(values)
      setSaving(true)
      if (editingId) {
        await updateProduct(editingId, input)
        message.success(p.updated)
      } else {
        await createProduct(input)
        message.success(p.created)
      }
      closeModal()
      await refetchProducts()
      void listDistinctProductSizes()
        .then(setSizeOptions)
        .catch(() => {
          /* ignore */
        })
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof Error ? e.message : p.saveError)
    } finally {
      setSaving(false)
    }
  }

  const openBulkEdit = () => {
    bulkForm.resetFields()
    bulkForm.setFieldsValue({ bulkStockMode: 'set' })
    setBulkModalOpen(true)
  }

  const closeBulkModal = () => {
    setBulkModalOpen(false)
    bulkForm.resetFields()
  }

  const submitBulk = async () => {
    const ids = selectedRowKeys.map(String)
    if (ids.length === 0) {
      message.warning(p.bulkSelectWarn)
      return
    }

    const categoryTouched = bulkForm.isFieldTouched('bulkCategoryId')
    const sizeTouched = bulkForm.isFieldTouched('bulkSize')
    const priceTouched = bulkForm.isFieldTouched('bulkPriceDollars')
    const stockTouched = bulkForm.isFieldTouched('bulkStockValue')

    if (!categoryTouched && !sizeTouched && !priceTouched && !stockTouched) {
      message.warning(p.bulkFieldWarn)
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
          message.warning(p.bulkPriceWarn)
          return
        }
        patch.priceCents = dollarsToCents(values.bulkPriceDollars)
      }
      if (stockTouched) {
        const raw = values.bulkStockValue
        if (raw == null || Number.isNaN(Number(raw))) {
          message.warning(p.bulkStockWarn)
          return
        }
        const n = Math.trunc(Number(raw))
        if (values.bulkStockMode === 'adjust') {
          patch.stockAdjust = n
        } else {
          patch.stockSet = Math.max(0, n)
        }
      }

      setBulkSaving(true)
      await bulkPatchProducts(ids, products, patch)
      message.success(p.bulkDone(ids.length))
      closeBulkModal()
      setSelectedRowKeys([])
      await refetchProducts()
      void listDistinctProductSizes()
        .then(setSizeOptions)
        .catch(() => {
          /* ignore refresh errors */
        })
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof Error ? e.message : p.bulkError)
    } finally {
      setBulkSaving(false)
    }
  }

  const onDelete = (row: Product) => {
    modal.confirm({
      title: p.deleteTitle,
      content: p.deleteBody(row.name),
      okText: common.delete,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteProduct(row.id)
          message.success(p.deleted)
          await refetchProducts()
          void listDistinctProductSizes()
            .then(setSizeOptions)
            .catch(() => {
              /* ignore */
            })
        } catch (e) {
          message.error(e instanceof Error ? e.message : p.deleteError)
        }
      },
    })
  }

  const columns: ColumnsType<Product> = [
    {
      title: p.colName,
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
    {
      title: p.colType,
      key: 'kind',
      width: 108,
      render: (_, row) =>
        row.kind === 'CUSTOM_BUNDLE' ? (
          <Tag color="purple">{p.kindCustomBundle}</Tag>
        ) : (
          <Tag>{p.kindStandard}</Tag>
        ),
    },
    {
      title: p.colSize,
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size: string | null) => (size?.trim() ? size : common.dash),
    },
    { title: p.colSku, dataIndex: 'sku', key: 'sku', width: 120 },
    {
      title: p.colCategory,
      key: 'cat',
      width: 120,
      render: (_, row) => row.categoryName ?? common.dash,
    },
    {
      title: p.colPrice,
      dataIndex: 'price',
      key: 'price',
      width: 100,
      align: 'right',
      render: (cents: number) => formatMoney(cents),
    },
    {
      title: p.colStock,
      dataIndex: 'stock',
      key: 'stock',
      width: 80,
      align: 'right',
    },
    {
      title: p.colActive,
      dataIndex: 'isActive',
      key: 'active',
      width: 88,
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>{active ? common.yes : common.no}</Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 140,
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
    <div className="admin-page">
      <Space align="center" style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          {p.pageTitle}
        </Title>
        <Space>
          <Button disabled={selectedRowKeys.length === 0} onClick={openBulkEdit}>
            {p.bulkEdit}
          </Button>
          <Button type="primary" onClick={openCreate}>
            {p.newProduct}
          </Button>
        </Space>
      </Space>

      <Card>
        <Form<FilterFormValues>
          form={filterForm}
          layout="inline"
          style={{ marginBottom: 16, rowGap: 8 }}
        >
          <Form.Item name="filterName" label={p.filterName}>
            <Input allowClear placeholder={p.filterNamePh} style={{ width: 168 }} />
          </Form.Item>
          <Form.Item name="filterSku" label={p.filterSku}>
            <Input allowClear placeholder={p.filterSkuPh} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="filterSize" label={p.filterSize}>
            <Select
              allowClear
              placeholder={p.filterSizeAll}
              style={{ width: 140 }}
              options={sizeFilterOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="filterCategoryId" label={p.filterCategory}>
            <Select
              allowClear
              placeholder={p.filterCategoryAll}
              style={{ width: 180 }}
              options={categoryOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item>
            <Button htmlType="button" onClick={resetFilters}>
              {common.reset}
            </Button>
          </Form.Item>
        </Form>
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
        title={editingId ? p.modalEdit : p.modalCreate}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void submit()}
        confirmLoading={saving}
        destroyOnClose
        width={640}
        okText={common.save}
      >
        <Form<FormValues> form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="productKind" label={p.labelProductKind}>
            <Radio.Group>
              <Radio value="STANDARD">{p.kindStandard}</Radio>
              <Radio value="CUSTOM_BUNDLE">{p.kindCustomBundle}</Radio>
            </Radio.Group>
          </Form.Item>
          {productKindWatch === 'CUSTOM_BUNDLE' ? (
            <>
              <Form.Item
                name="bundleTotalQty"
                label={p.labelBundleTotalQty}
                rules={[{ required: true, type: 'number', min: 1 }]}
                extra={p.bundleTotalQtyPh}
              >
                <InputNumber min={1} step={1} precision={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label={p.bundleOptionsLabel} required>
                <Form.List name="bundleOptions">
                  {(fields, { add, remove }) => (
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                      {fields.map(({ key, name, ...restField }) => (
                        <Space key={key} style={{ width: '100%', flexWrap: 'wrap' }} align="baseline">
                          <Form.Item
                            {...restField}
                            name={[name, 'productId']}
                            rules={[{ required: true, message: common.required }]}
                            style={{ flex: '1 1 200px', marginBottom: 0, minWidth: 0 }}
                          >
                            <Select
                              placeholder={p.bundleProductCol}
                              options={componentProductOptions}
                              showSearch
                              optionFilterProp="label"
                            />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, 'qty']}
                            rules={[{ required: true, type: 'number', min: 1 }]}
                            style={{ width: 120, marginBottom: 0 }}
                          >
                            <InputNumber min={1} step={1} precision={0} placeholder={p.bundleQtyCol} />
                          </Form.Item>
                          <MinusCircleOutlined
                            onClick={() => remove(name)}
                            style={{ color: '#ff4d4f', cursor: 'pointer' }}
                          />
                        </Space>
                      ))}
                      <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                        {p.bundleAddRow}
                      </Button>
                    </Space>
                  )}
                </Form.List>
              </Form.Item>
            </>
          ) : null}
          <Form.Item name="name" label={p.labelName} rules={[{ required: true, message: common.required }]}>
            <Input />
          </Form.Item>
          <Form.Item name="nameEn" label={p.labelNameEn}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={p.labelDescription}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="size" label={p.labelSize}>
            <Input placeholder={p.sizePh} />
          </Form.Item>
          <Form.Item name="sku" label={p.labelSku} rules={[{ required: true, message: common.required }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="priceDollars"
            label={p.labelPrice}
            rules={[{ required: true, type: 'number', min: 0 }]}
            extra={p.priceExtra}
          >
            <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="stock"
            label={p.labelStock}
            rules={[{ required: true, type: 'number', min: 0 }]}
            extra={productKindWatch === 'CUSTOM_BUNDLE' ? p.stockBundleExtra : undefined}
          >
            <InputNumber min={0} step={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="categoryId" label={p.labelCategory}>
            <Select
              allowClear
              placeholder={p.categoryPh}
              options={categoryOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="isActive" label={p.labelActive} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={p.bulkTitle(selectedRowKeys.length)}
        open={bulkModalOpen}
        onCancel={closeBulkModal}
        onOk={() => void submitBulk()}
        confirmLoading={bulkSaving}
        destroyOnClose
        width={520}
        okText={p.bulkApply}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          {p.bulkHint}
        </Typography.Paragraph>
        <Form<BulkFormValues> form={bulkForm} layout="vertical" initialValues={{ bulkStockMode: 'set' }}>
          <Form.Item name="bulkCategoryId" label={p.bulkCategory}>
            <Select
              allowClear
              placeholder={p.bulkCategoryPh}
              options={categoryOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="bulkSize" label={p.bulkSize}>
            <AutoComplete
              allowClear
              placeholder={p.bulkSizePh}
              options={sizeSuggestions}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="bulkPriceDollars" label={p.bulkPrice} extra={p.bulkPriceExtra}>
            <InputNumber
              min={0}
              step={0.01}
              precision={2}
              style={{ width: '100%' }}
              placeholder={p.bulkPricePh}
            />
          </Form.Item>

          <Divider plain style={{ margin: '8px 0 12px' }}>
            {p.bulkStockTitle}
          </Divider>
          <Form.Item name="bulkStockMode" label={p.bulkStockModeLabel}>
            <Radio.Group>
              <Radio value="set">{p.bulkStockSet}</Radio>
              <Radio value="adjust">{p.bulkStockAdjust}</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="bulkStockValue"
            label={
              bulkStockMode === 'adjust' ? p.bulkStockValueAdjustLabel : p.bulkStockValueSetLabel
            }
            extra={p.bulkStockExtra}
          >
            <InputNumber
              step={1}
              precision={0}
              min={bulkStockMode === 'set' ? 0 : undefined}
              style={{ width: '100%' }}
              placeholder={p.bulkStockPh}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
