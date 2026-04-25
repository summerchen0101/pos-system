import {
  Card,
  Col,
  DatePicker,
  Row,
  Select,
  Space,
  Table,
  Typography,
  theme,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { listBoothsAdmin, type AdminBooth } from "../api/boothsAdmin";
import {
  fetchDashboardStats,
  type DashboardTopProduct,
} from "../api/dashboardApi";
import { DateRangeQuickButtons } from "../components/DateRangeQuickButtons";
import { formatMoney } from "../lib/money";
import { zhtw } from "../locales/zhTW";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const d = zhtw.admin.dashboard;

function startEndRange(d0: Dayjs, d1: Dayjs): { start: Date; end: Date } {
  const a = d0.isAfter(d1) ? d1 : d0;
  const b = d0.isAfter(d1) ? d0 : d1;
  return { start: a.startOf("day").toDate(), end: b.endOf("day").toDate() };
}

export function AdminDashboardPage() {
  const { token } = theme.useToken();
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [dayjs(), dayjs()]);
  const [boothId, setBoothId] = useState<string | null>(null);
  const [booths, setBooths] = useState<AdminBooth[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSales, setTotalSales] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [topProducts, setTopProducts] = useState<DashboardTopProduct[]>([]);
  const [salesByBooth, setSalesByBooth] = useState<
    { boothName: string; salesCents: number; orderCount: number }[]
  >([]);

  const loadBooths = useCallback(async () => {
    try {
      setBooths(await listBoothsAdmin());
    } catch {
      setBooths([]);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b] = range;
      const { start, end } = startEndRange(a, b);
      const stats = await fetchDashboardStats({
        rangeStart: start,
        rangeEnd: end,
        boothId: boothId ?? undefined,
      });
      setTotalSales(stats.totalSalesCents);
      setOrderCount(stats.orderCount);
      setTopProducts(stats.topProducts);
      setSalesByBooth(
        stats.salesByBooth.map((x) => ({
          boothName: x.boothName,
          salesCents: x.salesCents,
          orderCount: x.orderCount,
        })),
      );
    } catch {
      setTotalSales(0);
      setOrderCount(0);
      setTopProducts([]);
      setSalesByBooth([]);
    } finally {
      setLoading(false);
    }
  }, [range, boothId]);

  useEffect(() => {
    void loadBooths();
  }, [loadBooths]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const boothChartData = useMemo(
    () =>
      salesByBooth.map((x) => ({
        name: x.boothName,
        sales: Math.round(x.salesCents / 100),
        orders: x.orderCount,
      })),
    [salesByBooth],
  );

  const topProductChartData = useMemo(
    () =>
      topProducts.slice(0, 8).map((x) => ({
        name:
          x.productName.length > 14
            ? `${x.productName.slice(0, 12)}…`
            : x.productName,
        revenue: Math.round(x.revenueCents / 100),
        qty: x.quantity,
      })),
    [topProducts],
  );

  const topColumns: ColumnsType<DashboardTopProduct> = [
    {
      title: d.colProduct,
      dataIndex: "productName",
      key: "name",
      ellipsis: true,
    },
    {
      title: d.colQty,
      dataIndex: "quantity",
      key: "qty",
      width: 88,
      align: "right",
    },
    {
      title: d.colRevenue,
      dataIndex: "revenueCents",
      key: "rev",
      align: "right",
      render: (c: number) => formatMoney(c),
    },
  ];

  const chartAxisColor = token.colorTextSecondary;
  const chartGrid = token.colorSplit;

  const chartTooltip = useMemo(
    () => ({
      contentStyle: {
        background: token.colorBgElevated,
        border: `1px solid ${token.colorBorder}`,
      },
      itemStyle: { color: token.colorText },
      labelStyle: { color: token.colorText },
    }),
    [token],
  );

  const barChartTooltip = useMemo(
    () => ({
      ...chartTooltip,
      cursor: { fill: token.colorFillTertiary },
    }),
    [chartTooltip, token],
  );

  return (
    <div className="admin-page">
      <Title level={4} style={{ marginTop: 0 }}>
        {d.pageTitle}
      </Title>
      <Space wrap style={{ marginBottom: 20 }}>
        <Text>{d.filterDateRange}</Text>
        <DateRangeQuickButtons onChange={setRange} />
        <RangePicker
          value={range}
          onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])}
        />
        <Text>{d.filterBooth}</Text>
        <Select
          allowClear
          placeholder={d.filterBoothAll}
          style={{ minWidth: 200 }}
          options={booths.map((b) => ({
            label: b.location ? `${b.name}（${b.location}）` : b.name,
            value: b.id,
          }))}
          value={boothId ?? undefined}
          onChange={(v) => setBoothId(v ?? null)}
        />
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading} styles={{ body: { padding: 20 } }}>
            <Text type="secondary">{d.cardTotalSales}</Text>
            <Title level={3} style={{ margin: "8px 0 0" }}>
              {formatMoney(totalSales)}
            </Title>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card loading={loading} styles={{ body: { padding: 20 } }}>
            <Text type="secondary">{d.cardOrderCount}</Text>
            <Title level={3} style={{ margin: "8px 0 0" }}>
              {orderCount}
            </Title>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title={d.chartTopProducts} loading={loading}>
            {topProductChartData.length === 0 ? (
              <Text type="secondary">{d.chartEmpty}</Text>
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={topProductChartData}
                    layout="vertical"
                    margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                    <XAxis
                      type="number"
                      tick={{ fill: chartAxisColor, fontSize: 11 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={100}
                      tick={{ fill: chartAxisColor, fontSize: 11 }}
                    />
                    <Tooltip
                      {...barChartTooltip}
                      formatter={(value: number) => [
                        `NT$${value}`,
                        d.tooltipRevenue,
                      ]}
                    />
                    <Bar
                      dataKey="revenue"
                      fill={token.colorPrimary}
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={d.chartSalesByBooth} loading={loading}>
            {boothChartData.length === 0 ? (
              <Text type="secondary">{d.chartEmpty}</Text>
            ) : (
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={boothChartData}
                    margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: chartAxisColor, fontSize: 11 }}
                    />
                    <YAxis tick={{ fill: chartAxisColor, fontSize: 11 }} />
                    <Tooltip
                      {...barChartTooltip}
                      formatter={(value: number) => [
                        `NT$${value}`,
                        d.tooltipSales,
                      ]}
                    />
                    <Bar
                      dataKey="sales"
                      fill={token.colorSuccess}
                      name="sales"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        title={d.tableTopProducts}
        style={{ marginTop: 16 }}
        loading={loading}>
        <Table<DashboardTopProduct>
          rowKey={(r) => `${r.productName}-${r.quantity}`}
          size="small"
          pagination={false}
          columns={topColumns}
          dataSource={topProducts}
          locale={{ emptyText: d.chartEmpty }}
        />
      </Card>
    </div>
  );
}
