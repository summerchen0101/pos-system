import { Button, Card, Col, DatePicker, Row, Select, Space, Table, Typography, theme } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { isAdminRole, isManagerRole } from '../api/authProfile'
import {
  buildBuyerProfileCsv,
  fetchBuyerProfileOrders,
  type BuyerProfileOrderRow,
} from '../api/buyerProfileAnalyticsApi'
import { listBoothsAdmin, type AdminBooth } from '../api/boothsAdmin'
import { useAuth } from '../auth/AuthContext'
import { zhtw } from '../locales/zhTW'
import type { BuyerAgeGroup, BuyerGender, BuyerMotivation } from '../types/order'
import { DateRangeQuickButtons } from '../components/DateRangeQuickButtons'
import { palette } from '../theme/palette'

const { RangePicker } = DatePicker
const { Title, Text } = Typography
const a = zhtw.admin.analytics
const common = zhtw.common

function startEndRange(d0: Dayjs, d1: Dayjs): { start: Date; end: Date } {
  const x = d0.isAfter(d1) ? d1 : d0
  const y = d0.isAfter(d1) ? d0 : d1
  return { start: x.startOf('day').toDate(), end: y.endOf('day').toDate() }
}

function asPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function groupCount<K extends string>(items: K[]): Record<K, number> {
  return items.reduce(
    (acc, k) => {
      acc[k] = (acc[k] ?? 0) + 1
      return acc
    },
    {} as Record<K, number>,
  )
}

export function AdminBuyerAnalyticsPage() {
  const { token } = theme.useToken()
  const { profile } = useAuth()
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [dayjs(), dayjs()])
  const [boothId, setBoothId] = useState<string | null>(null)
  const [booths, setBooths] = useState<AdminBooth[]>([])
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<BuyerProfileOrderRow[]>([])
  const [csvMode, setCsvMode] = useState<'filled' | 'all'>('all')

  const canView = profile != null && (isAdminRole(profile.role) || isManagerRole(profile.role))
  if (!canView) return <Navigate to="/admin/orders" replace />

  const genderLabel = useCallback((v: BuyerGender | null): string => {
    if (v === 'male') return a.genderMale
    if (v === 'female') return a.genderFemale
    if (v === 'other') return a.genderOther
    return a.unfilled
  }, [])

  const ageLabel = useCallback((v: BuyerAgeGroup | null): string => {
    if (v === 'under_18') return a.ageUnder18
    if (v === '18_24') return a.age18to24
    if (v === '25_34') return a.age25to34
    if (v === '35_44') return a.age35to44
    if (v === '45_54') return a.age45to54
    if (v === '55_above') return a.age55Above
    return a.unfilled
  }, [])

  const motivationLabel = useCallback((v: BuyerMotivation | null): string => {
    if (v === 'self_use') return a.motivationSelfUse
    if (v === 'gift') return a.motivationGift
    if (v === 'trial') return a.motivationTrial
    if (v === 'repurchase') return a.motivationRepurchase
    if (v === 'other') return a.motivationOther
    return a.unfilled
  }, [])

  const loadBooths = useCallback(async () => {
    try {
      setBooths(await listBoothsAdmin())
    } catch {
      setBooths([])
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d0, d1] = range
      const { start, end } = startEndRange(d0, d1)
      const data = await fetchBuyerProfileOrders({ rangeStart: start, rangeEnd: end, boothId: boothId ?? undefined })
      setRows(data)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [range, boothId])

  useEffect(() => {
    void loadBooths()
  }, [loadBooths])

  useEffect(() => {
    void load()
  }, [load])

  const profileFilledRows = useMemo(
    () => rows.filter((r) => r.buyerGender != null || r.buyerAgeGroup != null || r.buyerMotivation != null),
    [rows],
  )

  const topCards = useMemo(() => {
    const total = rows.length
    const filled = profileFilledRows.length
    const ratio = total > 0 ? filled / total : 0
    return { total, filled, ratio }
  }, [rows, profileFilledRows])

  const genderData = useMemo(() => {
    const c = groupCount(rows.map((r) => (r.buyerGender ?? 'unfilled') as BuyerGender | 'unfilled'))
    return [
      { key: 'male', name: a.genderMale, value: c.male ?? 0, color: palette.accent },
      { key: 'female', name: a.genderFemale, value: c.female ?? 0, color: '#9d8b62' },
      { key: 'other', name: a.genderOther, value: c.other ?? 0, color: '#7b6a47' },
      { key: 'unfilled', name: a.unfilled, value: c.unfilled ?? 0, color: '#4a4845' },
    ]
  }, [rows])

  const ageOrder: (BuyerAgeGroup | 'unfilled')[] = ['under_18', '18_24', '25_34', '35_44', '45_54', '55_above', 'unfilled']
  const ageData = useMemo(() => {
    const c = groupCount(rows.map((r) => (r.buyerAgeGroup ?? 'unfilled') as BuyerAgeGroup | 'unfilled'))
    return ageOrder.map((k) => ({ key: k, name: ageLabel(k === 'unfilled' ? null : k), value: c[k] ?? 0 }))
  }, [rows, ageLabel])

  const motiveOrder: (BuyerMotivation | 'unfilled')[] = ['self_use', 'gift', 'trial', 'repurchase', 'other', 'unfilled']
  const motivationData = useMemo(() => {
    const c = groupCount(rows.map((r) => (r.buyerMotivation ?? 'unfilled') as BuyerMotivation | 'unfilled'))
    return motiveOrder.map((k) => ({ key: k, name: motivationLabel(k === 'unfilled' ? null : k), value: c[k] ?? 0 }))
  }, [rows, motivationLabel])

  const genderByMotivation = useMemo(() => {
    return motiveOrder.map((m) => {
      const list = rows.filter((r) => (r.buyerMotivation ?? 'unfilled') === m)
      const c = groupCount(list.map((r) => (r.buyerGender ?? 'unfilled') as BuyerGender | 'unfilled'))
      return {
        motivation: motivationLabel(m === 'unfilled' ? null : m),
        male: c.male ?? 0,
        female: c.female ?? 0,
        other: c.other ?? 0,
        unfilled: c.unfilled ?? 0,
      }
    })
  }, [rows, motivationLabel])

  const heatMax = useMemo(() => {
    let m = 0
    for (const ageKey of ageOrder) {
      for (const motKey of motiveOrder) {
        const c = rows.filter(
          (r) => (r.buyerAgeGroup ?? 'unfilled') === ageKey && (r.buyerMotivation ?? 'unfilled') === motKey,
        ).length
        m = Math.max(m, c)
      }
    }
    return m
  }, [rows])

  const heatTableColumns: ColumnsType<{ age: string; [k: string]: string | number }> = useMemo(() => {
    const cols: ColumnsType<{ age: string; [k: string]: string | number }> = [{ title: a.ageAxis, dataIndex: 'age', key: 'age', width: 100 }]
    for (const m of motiveOrder) {
      const key = `m_${m}`
      cols.push({
        title: motivationLabel(m === 'unfilled' ? null : m),
        dataIndex: key,
        key,
        align: 'center',
        render: (v: number) => {
          const ratio = heatMax > 0 ? Math.min(1, v / heatMax) : 0
          const bg = `rgba(200, 169, 110, ${ratio * 0.38})`
          return (
            <div style={{ borderRadius: 6, background: bg, padding: '4px 0', fontVariantNumeric: 'tabular-nums' }}>
              {v}
            </div>
          )
        },
      })
    }
    return cols
  }, [motivationLabel, heatMax])

  const heatTableRows = useMemo(() => {
    return ageOrder.map((ageKey) => {
      const rec: Record<string, string | number> = {
        key: `age_${ageKey}`,
        age: ageLabel(ageKey === 'unfilled' ? null : ageKey),
      }
      for (const m of motiveOrder) {
        rec[`m_${m}`] = rows.filter(
          (r) => (r.buyerAgeGroup ?? 'unfilled') === ageKey && (r.buyerMotivation ?? 'unfilled') === m,
        ).length
      }
      return rec as { key: string; age: string; [k: string]: string | number }
    })
  }, [rows, ageLabel, motivationLabel])

  const exportCsv = () => {
    const [d0, d1] = range
    const src = csvMode === 'filled' ? profileFilledRows : rows
    const csv = buildBuyerProfileCsv(src, { gender: genderLabel, age: ageLabel, motivation: motivationLabel })
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement('a')
    aEl.href = url
    aEl.download = `buyer_profile_${d0.format('YYYYMMDD')}_${d1.format('YYYYMMDD')}.csv`
    document.body.appendChild(aEl)
    aEl.click()
    aEl.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="admin-page">
      <Title level={4} style={{ marginTop: 0 }}>{a.pageTitle}</Title>
      <Space wrap style={{ marginBottom: 16 }}>
        <Text>{a.filterDateRange}</Text>
        <DateRangeQuickButtons onChange={setRange} />
        <RangePicker value={range} onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])} />
        <Text>{a.filterBooth}</Text>
        <Select
          allowClear
          placeholder={a.filterBoothAll}
          style={{ minWidth: 220 }}
          options={booths.map((b) => ({ label: b.location ? `${b.name}（${b.location}）` : b.name, value: b.id }))}
          value={boothId ?? undefined}
          onChange={(v) => setBoothId(v ?? null)}
        />
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card loading={loading}>
            <Text type="secondary">{a.cardTotalOrders}</Text>
            <Title level={3} style={{ margin: '8px 0 0' }}>{topCards.total}</Title>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card loading={loading}>
            <Text type="secondary">{a.cardFilledCount}</Text>
            <Title level={3} style={{ margin: '8px 0 0' }}>
              {topCards.filled} <Text type="secondary">({asPct(topCards.ratio)})</Text>
            </Title>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title={a.chartGender} loading={loading}>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={genderData} dataKey="value" nameKey="name" outerRadius={96} label>
                    {genderData.map((g) => <Cell key={g.key} fill={g.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={a.chartAge} loading={loading}>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={ageData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={token.colorSplit} />
                  <XAxis type="number" tick={{ fill: token.colorTextSecondary, fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: token.colorTextSecondary, fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill={palette.accent} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title={a.chartMotivation} loading={loading}>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={motivationData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={token.colorSplit} />
                  <XAxis type="number" tick={{ fill: token.colorTextSecondary, fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: token.colorTextSecondary, fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#9d8b62" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={a.chartGenderByMotivation} loading={loading}>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={genderByMotivation} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={token.colorSplit} />
                  <XAxis type="number" tick={{ fill: token.colorTextSecondary, fontSize: 11 }} />
                  <YAxis type="category" dataKey="motivation" width={100} tick={{ fill: token.colorTextSecondary, fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="male" stackId="g" fill={palette.accent} />
                  <Bar dataKey="female" stackId="g" fill="#9d8b62" />
                  <Bar dataKey="other" stackId="g" fill="#7b6a47" />
                  <Bar dataKey="unfilled" stackId="g" fill="#4a4845" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>

      <Card title={a.tableAgeByMotivation} style={{ marginTop: 16 }} loading={loading}>
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          columns={heatTableColumns}
          dataSource={heatTableRows}
          locale={{ emptyText: common.dash }}
        />
        <Space style={{ marginTop: 14 }} wrap>
          <Select
            value={csvMode}
            onChange={(v) => setCsvMode(v)}
            options={[
              { value: 'filled', label: a.csvFilledOnly },
              { value: 'all', label: a.csvAllOrders },
            ]}
            style={{ minWidth: 220 }}
          />
          <Button type="primary" onClick={exportCsv}>
            {a.exportCsv}
          </Button>
        </Space>
      </Card>
    </div>
  )
}
