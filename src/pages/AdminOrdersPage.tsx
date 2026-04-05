import { DatePicker, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { fetchOrdersForDateRange } from '../api/ordersApi'
import { zhtw } from '../locales/zhTW'
import { formatMoney } from '../lib/money'
import type { Order } from '../types/order'

const { Title } = Typography
const o = zhtw.admin.orders

function startEndOfDay(d: Dayjs): { start: Date; end: Date } {
  const start = d.startOf('day').toDate()
  const end = d.endOf('day').toDate()
  return { start, end }
}

export function AdminOrdersPage() {
  const [selectedDay, setSelectedDay] = useState<Dayjs>(() => dayjs())
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { start, end } = startEndOfDay(selectedDay)
      const list = await fetchOrdersForDateRange(start, end)
      setOrders(list)
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [selectedDay])

  useEffect(() => {
    void load()
  }, [load])

  const columns: ColumnsType<Order> = [
    {
      title: o.colDate,
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (iso: string) => dayjs(iso).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: o.colTotal,
      dataIndex: 'totalAmountCents',
      key: 'total',
      align: 'right',
      render: (cents: number) => formatMoney(cents),
    },
    {
      title: o.colDiscount,
      dataIndex: 'discountAmountCents',
      key: 'discount',
      align: 'right',
      render: (cents: number) => formatMoney(cents),
    },
    {
      title: o.colFinal,
      dataIndex: 'finalAmountCents',
      key: 'final',
      align: 'right',
      render: (cents: number) => formatMoney(cents),
    },
  ]

  return (
    <div className="admin-page">
      <Title level={4} style={{ marginTop: 0 }}>
        {o.pageTitle}
      </Title>
      <div style={{ marginBottom: 16 }}>
        <span style={{ marginRight: 8 }}>{o.dateLabel}</span>
        <DatePicker value={selectedDay} onChange={(d) => d && setSelectedDay(d)} allowClear={false} />
      </div>
      <Table<Order>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={orders}
        pagination={{ pageSize: 15 }}
      />
    </div>
  )
}
