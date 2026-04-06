import { CalendarOutlined } from "@ant-design/icons";
import {
  Card,
  Col,
  DatePicker,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { listBoothsAdmin } from "../api/boothsAdmin";
import {
  type ClockLogReportRow,
  listClockLogReportRows,
  shiftKindLabel,
  summarizeTodayRows,
  taipeiTodayIso,
} from "../api/clockLogsReport";
import { isAdminRole } from "../api/authProfile";
import { useAuth } from "../auth/AuthContext";
import { formatShiftTime } from "../lib/shiftCalendar";
import { zhtw } from "../locales/zhTW";

dayjs.extend(utc);
dayjs.extend(timezone);

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const c = zhtw.admin.clockLogs;

type StatusFilter = "all" | "ok" | "late" | "very_late" | "missing";

function formatAtTaipei(iso: string | null): string {
  if (!iso) return zhtw.common.dash;
  return dayjs(iso).tz("Asia/Taipei").format("YYYY-MM-DD HH:mm");
}

function statusTag(
  row: ClockLogReportRow,
): { label: string; color: string } | null {
  switch (row.status) {
    case "ok":
      return { label: c.statusOk, color: "success" };
    case "late":
      return { label: c.statusLate, color: "warning" };
    case "very_late":
      return { label: c.statusVeryLate, color: "error" };
    case "missing":
      return { label: c.statusMissing, color: "default" };
    case "upcoming":
      return { label: c.statusUpcoming, color: "default" };
    default:
      return null;
  }
}

export type ClockLogsReportVariant = "admin" | "staff";

export function ClockLogsReportPage({ variant }: { variant: ClockLogsReportVariant }) {
  const { profile } = useAuth();
  const isAdmin = profile ? isAdminRole(profile.role) : false;

  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(() => [
    dayjs().tz("Asia/Taipei").startOf("day"),
    dayjs().tz("Asia/Taipei").startOf("day"),
  ]);
  const [boothId, setBoothId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [booths, setBooths] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<ClockLogReportRow[]>([]);
  const [summary, setSummary] = useState({ presentUserIds: 0, lateUserIds: 0, missingShiftCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (variant === "admin") {
      void listBoothsAdmin()
        .then((b) => setBooths(b))
        .catch(() => setBooths([]));
    }
  }, [variant]);

  const lockedUserId = variant === "staff" ? profile?.id ?? null : null;

  const load = useCallback(async () => {
    if (variant === "staff" && !lockedUserId) return;
    setLoading(true);
    try {
      const [a, b] = dateRange;
      const from = a.isAfter(b) ? b.format("YYYY-MM-DD") : a.format("YYYY-MM-DD");
      const to = a.isAfter(b) ? a.format("YYYY-MM-DD") : b.format("YYYY-MM-DD");
      const today = taipeiTodayIso();

      const baseOpts = {
        fromDate: from,
        toDate: to,
        boothId: variant === "admin" ? boothId : null,
        userId: lockedUserId,
      };

      const [tableRows, todayRows] = await Promise.all([
        listClockLogReportRows(baseOpts),
        listClockLogReportRows({
          fromDate: today,
          toDate: today,
          boothId: variant === "admin" ? boothId : null,
          userId: lockedUserId,
        }),
      ]);

      setRows(tableRows);
      setSummary(summarizeTodayRows(todayRows, today));
    } catch {
      setRows([]);
      setSummary({ presentUserIds: 0, lateUserIds: 0, missingShiftCount: 0 });
    } finally {
      setLoading(false);
    }
  }, [boothId, dateRange, lockedUserId, variant]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    if (statusFilter === "all") return rows;
    if (statusFilter === "ok") return rows.filter((r) => r.status === "ok");
    if (statusFilter === "late") return rows.filter((r) => r.status === "late");
    if (statusFilter === "very_late") return rows.filter((r) => r.status === "very_late");
    if (statusFilter === "missing") return rows.filter((r) => r.status === "missing");
    return rows;
  }, [rows, statusFilter]);

  const columns: ColumnsType<ClockLogReportRow> = useMemo(
    () => [
      { title: c.colName, dataIndex: "user_name", key: "n", width: 100, ellipsis: true },
      { title: c.colBooth, dataIndex: "booth_name", key: "b", width: 112, ellipsis: true },
      {
        title: c.colKind,
        key: "k",
        width: 72,
        render: (_, r) => shiftKindLabel(r.start_time, c.kindEarly, c.kindLate),
      },
      {
        title: c.colScheduledStart,
        key: "ss",
        width: 96,
        render: (_, r) =>
          dayjs
            .tz(`${r.shift_date}T${formatShiftTime(r.start_time)}:00`, "Asia/Taipei")
            .format("HH:mm"),
      },
      {
        title: c.colClockIn,
        key: "ci",
        width: 140,
        render: (_, r) => formatAtTaipei(r.clock_in_at),
      },
      {
        title: c.colStatus,
        key: "st",
        width: 100,
        render: (_, r) => {
          const t = statusTag(r);
          if (!t) return zhtw.common.dash;
          return <Tag color={t.color}>{t.label}</Tag>;
        },
      },
      {
        title: c.colClockOut,
        key: "co",
        width: 140,
        render: (_, r) => formatAtTaipei(r.clock_out_at),
      },
    ],
    [],
  );

  if (!profile) {
    return (
      <div style={{ padding: 24 }}>
        <Text type="secondary">{zhtw.common.loading}</Text>
      </div>
    );
  }

  if (variant === "admin" && !isAdmin) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const title = variant === "admin" ? c.pageTitle : c.myPageTitle;

  return (
    <div style={{ padding: 24 }}>
      <Title level={3} style={{ marginTop: 0 }}>
        <CalendarOutlined style={{ marginRight: 8 }} />
        {title}
      </Title>
      <Text type="secondary">{c.hint}</Text>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title={c.summaryPresent} value={summary.presentUserIds} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title={c.summaryLate} value={summary.lateUserIds} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title={c.summaryMissing} value={summary.missingShiftCount} />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }}>
        <Space wrap style={{ marginBottom: 16 }}>
          <RangePicker
            value={dateRange}
            onChange={(r) => {
              if (r?.[0] && r[1]) setDateRange([r[0], r[1]]);
            }}
          />
          {variant === "admin" ? (
            <>
              <Select
                allowClear
                placeholder={c.filterBoothAll}
                style={{ minWidth: 200 }}
                value={boothId ?? undefined}
                onChange={(v) => setBoothId(v ?? null)}
                options={booths.map((b) => ({ value: b.id, label: b.name }))}
              />
              <Select<StatusFilter>
                style={{ minWidth: 160 }}
                value={statusFilter}
                onChange={(v) => setStatusFilter(v)}
                options={[
                  { value: "all", label: c.statusAll },
                  { value: "ok", label: c.statusOk },
                  { value: "late", label: c.statusLate },
                  { value: "very_late", label: c.statusVeryLate },
                  { value: "missing", label: c.statusMissing },
                ]}
              />
            </>
          ) : null}
        </Space>

        <Table<ClockLogReportRow>
          rowKey="shift_id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={filteredRows}
          pagination={{ pageSize: 50, showSizeChanger: true }}
        />
      </Card>
    </div>
  );
}
