import { Button, DatePicker, Descriptions, Modal, Select, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { listBoothsAdmin, type AdminBooth } from '../api/boothsAdmin'
import { fetchOrderDetail, fetchOrdersForDateRange } from '../api/ordersApi'
import { zhtw } from '../locales/zhTW'
import { formatMoney } from '../lib/money'
import type { OrderDetail, OrderItem, OrderListEntry } from '../types/order'

const { Title, Text } = Typography
const { RangePicker } = DatePicker
const o = zhtw.admin.orders

function startEndRange(d0: Dayjs, d1: Dayjs): { start: Date; end: Date } {
  const a = d0.isAfter(d1) ? d1 : d0
  const b = d0.isAfter(d1) ? d0 : d1
  return { start: a.startOf('day').toDate(), end: b.endOf('day').toDate() }
}

function lineTags(item: OrderItem) {
  if (item.source === 'FREE_SELECTION') return <Tag color="purple">{o.tagFreeSelection}</Tag>
  if (item.source === 'BUNDLE_COMPONENT') return <Tag color="geekblue">{o.tagBundleComponent}</Tag>
  if (item.isGift) return <Tag color="blue">{o.tagGift}</Tag>
  if (item.isManualFree) return <Tag color="gold">{o.tagManualFree}</Tag>
  return null
}

export function AdminOrdersPage() {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(() => [dayjs(), dayjs()])
  const [boothFilterId, setBoothFilterId] = useState<string | null>(null)
  const [booths, setBooths] = useState<AdminBooth[]>([])
  const [orders, setOrders] = useState<OrderListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    void listBoothsAdmin()
      .then(setBooths)
      .catch(() => setBooths([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, b] = dateRange
      const { start, end } = startEndRange(a, b)
      const list = await fetchOrdersForDateRange(
        start,
        end,
        boothFilterId ? { boothId: boothFilterId } : undefined,
      )
      setOrders(list)
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [dateRange, boothFilterId])

  useEffect(() => {
    void load()
  }, [load])

  const openDetail = (orderId: string) => {
    setDetailOpen(true)
    setDetail(null)
    setDetailLoading(true)
    void (async () => {
      try {
        const d = await fetchOrderDetail(orderId)
        setDetail(d)
      } catch {
        setDetail(null)
      } finally {
        setDetailLoading(false)
      }
    })()
  }

  const columns: ColumnsType<OrderListEntry> = [
    {
      title: o.colDate,
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 152,
      render: (iso: string) => dayjs(iso).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: o.colBooth,
      key: 'booth',
      width: 120,
      ellipsis: true,
      render: (_, row) => row.boothName ?? zhtw.common.dash,
    },
    {
      title: o.colCashier,
      key: 'cashier',
      width: 100,
      ellipsis: true,
      render: (_, row) => row.cashierName ?? zhtw.common.dash,
    },
    {
      title: o.colFinal,
      dataIndex: 'finalAmountCents',
      key: 'final',
      align: 'right',
      width: 112,
      render: (cents: number) => formatMoney(cents),
    },
    {
      title: o.colPreview,
      dataIndex: 'itemsPreview',
      key: 'preview',
      ellipsis: true,
    },
    {
      title: o.colActions,
      key: 'actions',
      width: 120,
      render: (_, row) => (
        <Button type="link" size="small" onClick={() => openDetail(row.id)}>
          {o.viewDetails}
        </Button>
      ),
    },
  ]

  const itemColumns: ColumnsType<OrderItem> = [
    {
      title: o.colProduct,
      key: 'name',
      render: (_, item) => (
        <Space size={4} wrap>
          <span>{item.productName}</span>
          {lineTags(item)}
        </Space>
      ),
    },
    {
      title: o.colSize,
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (s: string | null) => s || '—',
    },
    {
      title: o.colQty,
      dataIndex: 'quantity',
      key: 'qty',
      width: 72,
      align: 'right',
    },
    {
      title: o.colUnitPrice,
      dataIndex: 'unitPriceCents',
      key: 'unit',
      align: 'right',
      render: (c: number) => formatMoney(c),
    },
    {
      title: o.colLineTotal,
      dataIndex: 'lineTotalCents',
      key: 'line',
      align: 'right',
      render: (c: number) => formatMoney(c),
    },
  ]

  const snap = detail?.promotionSnapshot
  const freeSelectionSnap = snap?.promotions?.filter((p) => p.type === 'FREE_SELECTION') ?? []
  const thresholdGiftLines = detail?.items.filter((i) => i.isGift && i.giftId) ?? []
  const freeSelectionLines = detail?.items.filter((i) => i.source === 'FREE_SELECTION') ?? []
  const manualFreeLines = detail?.items.filter((i) => i.isManualFree && i.source !== 'FREE_SELECTION') ?? []

  return (
    <div className="admin-page">
      <Title level={4} style={{ marginTop: 0 }}>
        {o.pageTitle}
      </Title>
      <Space wrap style={{ marginBottom: 16 }}>
        <span>{o.filterDateRange}</span>
        <RangePicker value={dateRange} onChange={(v) => v && v[0] && v[1] && setDateRange([v[0], v[1]])} />
        <span>{o.filterBooth}</span>
        <Select
          allowClear
          placeholder={o.filterBoothAll}
          style={{ minWidth: 200 }}
          options={booths.map((b) => ({
            label: b.location ? `${b.name}（${b.location}）` : b.name,
            value: b.id,
          }))}
          value={boothFilterId ?? undefined}
          onChange={(v) => setBoothFilterId(v ?? null)}
        />
      </Space>
      <Table<OrderListEntry>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={orders}
        pagination={{ pageSize: 15 }}
      />

      <Modal
        title={o.modalTitle}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setDetailOpen(false)}>
            {o.close}
          </Button>,
        ]}
        width={720}
        destroyOnClose
      >
        {detailLoading ? (
          <Text type="secondary">{o.modalLoading}</Text>
        ) : detail ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered>
              <Descriptions.Item label={o.colDate}>
                {dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
              <Descriptions.Item label={o.labelBoothInDetail}>
                {detail.boothName ?? zhtw.common.dash}
              </Descriptions.Item>
              <Descriptions.Item label={o.labelCashierInDetail}>
                {detail.cashierName ?? zhtw.common.dash}
              </Descriptions.Item>
              <Descriptions.Item label={o.colFinal}>{formatMoney(detail.finalAmountCents)}</Descriptions.Item>
              <Descriptions.Item label={o.colTotal}>{formatMoney(detail.totalAmountCents)}</Descriptions.Item>
              <Descriptions.Item label={o.colDiscount}>{formatMoney(detail.discountAmountCents)}</Descriptions.Item>
            </Descriptions>

            <div>
              <Title level={5} style={{ marginTop: 0 }}>
                {o.sectionItems}
              </Title>
              <Table<OrderItem>
                size="small"
                rowKey="id"
                pagination={false}
                columns={itemColumns}
                dataSource={detail.items}
                locale={{ emptyText: o.noItems }}
              />
            </div>

            <div>
              <Title level={5} style={{ marginTop: 0 }}>
                {o.sectionPromotions}
              </Title>
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label={o.promoDiscount}>
                  {formatMoney(detail.discountAmountCents)}
                </Descriptions.Item>
                <Descriptions.Item label={o.promoAuto}>
                  {snap?.autoPromotionName ?? '—'}
                </Descriptions.Item>
                <Descriptions.Item label={o.promoManual}>
                  {snap?.manualPromotionDetails?.length || freeSelectionSnap.length ? (
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {snap?.manualPromotionDetails?.map((m, i) => (
                        <li key={`${m.promotionId ?? i}-${m.name}`}>
                          {m.name}（{formatMoney(m.discountCents)}）
                        </li>
                      ))}
                      {freeSelectionSnap.map((p) => (
                        <li key={p.promotionId ?? p.description}>{p.description}</li>
                      ))}
                    </ul>
                  ) : (
                    '—'
                  )}
                </Descriptions.Item>
                <Descriptions.Item label={o.promoThreshold}>
                  {snap?.thresholdGiftSummaries?.length ? (
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {snap.thresholdGiftSummaries.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  ) : (
                    '—'
                  )}
                </Descriptions.Item>
                <Descriptions.Item label={o.promoGiftLines}>
                  {thresholdGiftLines.length ? (
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {thresholdGiftLines.map((g) => (
                        <li key={g.id}>
                          {g.productName}
                          {g.size ? `（${g.size}）` : ''} × {g.quantity}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    '—'
                  )}
                </Descriptions.Item>
                <Descriptions.Item label={o.promoFreeSelectionContent}>
                  {freeSelectionLines.length ? (
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {freeSelectionLines.map((g) => (
                        <li key={g.id}>
                          {g.productName}
                          {g.size ? `（${g.size}）` : ''} × {g.quantity}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    '—'
                  )}
                </Descriptions.Item>
                <Descriptions.Item label={o.promoManualFreeLines}>
                  {manualFreeLines.length ? (
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {manualFreeLines.map((g) => (
                        <li key={g.id}>
                          {g.productName}
                          {g.size ? `（${g.size}）` : ''} × {g.quantity}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    '—'
                  )}
                </Descriptions.Item>
              </Descriptions>
            </div>
          </div>
        ) : (
          <Text type="danger">{o.modalError}</Text>
        )}
      </Modal>
    </div>
  )
}
