import {
  CalendarOutlined,
  ExclamationCircleOutlined,
  LeftOutlined,
  RightOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  TimePicker,
  Typography,
  Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { listBoothsAdmin, type AdminBooth } from "../api/boothsAdmin";
import {
  adminApproveShiftSwap,
  adminRejectShiftSwap,
  buildShiftsClockCsv,
  createShiftAdmin,
  deleteShiftAdmin,
  deleteShiftsByUserBoothDate,
  getShiftsByIds,
  insertShiftsAdmin,
  listClockLogsForShiftIds,
  listShiftsInRange,
  listSwapRequestsForAdmin,
  updateShiftAdmin,
  type ShiftWithNames,
  type SwapRequestListEntry,
} from "../api/shifts";
import { listUsersAdmin, type AdminUserListEntry } from "../api/usersAdmin";
import {
  formatBoothActivityRangeLabel,
  shiftDateOutsideBoothActivity,
} from "../lib/boothActivity";
import { formatShiftTime, weekRangeIso } from "../lib/shiftCalendar";
import { consecutiveMetaByShiftId, logForShiftSegment } from "../lib/shiftConsecutive";
import {
  downloadShiftImportTemplate,
  existingShiftKey,
  parseImportDate,
  parseShiftImportXlsx,
  SHIFT_IMPORT_HEADERS,
  type ShiftImportPreviewRow,
  type ShiftImportValidateMessages,
} from "../lib/shiftXlsxImport";
import { zhtw } from "../locales/zhTW";
import { isAdminRole } from "../api/authProfile";
import { useAuth } from "../auth/AuthContext";

dayjs.extend(utc);
dayjs.extend(timezone);

const { Title, Text } = Typography;
const s = zhtw.admin.shifts;
const common = zhtw.common;

function shiftImportValidateMessages(): ShiftImportValidateMessages {
  return {
    errNameRequired: s.importNameRequired,
    errBoothRequired: s.importBoothRequired,
    errUserNotFound: s.importUserNotFound,
    errUserAmbiguous: s.importUserAmbiguous,
    errBoothNotFound: s.importBoothNotFound,
    errBoothAmbiguous: s.importBoothAmbiguous,
    errStaffBooth: s.importStaffBooth,
    errDateInvalid: s.importDateInvalid,
    errTimeStart: s.importTimeStartInvalid,
    errTimeEnd: s.importTimeEndInvalid,
    errTimeOrder: s.importTimeOrder,
    errDuplicateFile: s.importDupFile,
    warnDuplicateDb: s.importDupDb,
    errEmptyRow: s.importEmptyRows,
    errMissingHeader: s.importMissingHeader,
    errNoDataRows: s.importNoRows,
    warnBoothDateOutOfRange: s.importBoothDateWarn,
  };
}

type ShiftFormValues = {
  user_id: string;
  booth_id: string;
  shift_date: Dayjs;
  times: [Dayjs, Dayjs];
  note?: string;
};

function shiftTimeToDayjs(base: Dayjs, timeStr: string): Dayjs {
  const hm = formatShiftTime(timeStr);
  return base.startOf("day").hour(Number(hm.slice(0, 2))).minute(Number(hm.slice(3, 5)));
}

function groupShiftsByDate(rows: ShiftWithNames[]): Map<string, ShiftWithNames[]> {
  const m = new Map<string, ShiftWithNames[]>();
  for (const r of rows) {
    const list = m.get(r.shift_date) ?? [];
    list.push(r);
    m.set(r.shift_date, list);
  }
  for (const list of m.values()) {
    list.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  return m;
}

function adminShiftStatusTag(
  sh: ShiftWithNames,
  meta: ReturnType<typeof consecutiveMetaByShiftId>,
  logs: { shift_id: string; clock_in_at: string | null; clock_out_at: string | null }[],
  nowTaipei: dayjs.Dayjs,
) {
  const m = meta.get(sh.id)!;
  const logMap = new Map(logs.map((l) => [l.shift_id, l]));
  const log = logForShiftSegment(sh.id, meta, logMap);
  const todayIso = nowTaipei.format("YYYY-MM-DD");

  if (m.chainLength > 1 && m.indexInChain > 0) {
    return (
      <Tag color="purple" style={{ marginTop: 4 }}>
        {s.tagConsecutive}
      </Tag>
    );
  }

  const headStart = dayjs.tz(
    `${sh.shift_date}T${formatShiftTime(sh.start_time)}:00`,
    "Asia/Taipei",
  );
  const tailEnd = dayjs.tz(
    `${sh.shift_date}T${formatShiftTime(m.tail.end_time)}:00`,
    "Asia/Taipei",
  );

  if (log?.clock_in_at && log.clock_out_at) {
    const lateMin = dayjs(log.clock_in_at).diff(headStart, "minute");
    if (lateMin <= 10) {
      return (
        <Tag color="success" style={{ marginTop: 4 }}>
          {s.shiftCardClockedOk}
        </Tag>
      );
    }
    if (lateMin <= 30) {
      return (
        <Tag color="warning" style={{ marginTop: 4 }}>
          {s.shiftCardLate}
        </Tag>
      );
    }
    return (
      <Tag color="error" style={{ marginTop: 4 }}>
        {s.shiftCardVeryLate}
      </Tag>
    );
  }

  if (log?.clock_in_at && !log.clock_out_at) {
    return (
      <Tag color="processing" style={{ marginTop: 4 }}>
        {s.shiftCardClockedInOnly}
      </Tag>
    );
  }

  if (!log?.clock_in_at) {
    if (sh.shift_date > todayIso) {
      return (
        <Tag style={{ marginTop: 4 }} color="default">
          {s.clockNone}
        </Tag>
      );
    }
    if (sh.shift_date < todayIso) {
      return (
        <Tag
          style={{ marginTop: 4, border: "1px solid #ff4d4f", color: "#8c8c8c", background: "#2a2a2a" }}
        >
          {s.shiftCardMissingAfter}
        </Tag>
      );
    }
    if (nowTaipei.isBefore(headStart)) {
      return (
        <Tag style={{ marginTop: 4 }} color="default">
          {s.shiftCardBeforeOpen}
        </Tag>
      );
    }
    if (nowTaipei.isAfter(tailEnd)) {
      return (
        <Tag
          style={{ marginTop: 4, border: "1px solid #ff4d4f", color: "#8c8c8c", background: "#2a2a2a" }}
        >
          {s.shiftCardMissingAfter}
        </Tag>
      );
    }
    return (
      <Tag color="warning" style={{ marginTop: 4 }}>
        {s.clockNone}
      </Tag>
    );
  }

  return (
    <Tag style={{ marginTop: 4 }} color="default">
      {s.clockNone}
    </Tag>
  );
}

export function AdminShiftsPage() {
  const { message } = App.useApp();
  const { profile } = useAuth();
  const [form] = Form.useForm<ShiftFormValues>();

  const [weekAnchor, setWeekAnchor] = useState(() => dayjs());
  const { start: weekStart, end: weekEnd, days } = useMemo(
    () => weekRangeIso(weekAnchor),
    [weekAnchor],
  );

  const [boothFilter, setBoothFilter] = useState<string | null>(null);
  const [booths, setBooths] = useState<AdminBooth[]>([]);
  const [users, setUsers] = useState<AdminUserListEntry[]>([]);
  const [shifts, setShifts] = useState<ShiftWithNames[]>([]);
  const [logs, setLogs] = useState<
    { shift_id: string; clock_in_at: string | null; clock_out_at: string | null }[]
  >([]);
  const [swaps, setSwaps] = useState<SwapRequestListEntry[]>([]);
  const [swapShiftMap, setSwapShiftMap] = useState<Map<string, ShiftWithNames>>(new Map());

  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftWithNames | null>(null);
  const [saving, setSaving] = useState(false);

  const [exportRange, setExportRange] = useState<[Dayjs, Dayjs]>(() => [
    dayjs().startOf("isoWeek"),
    dayjs().endOf("isoWeek"),
  ]);
  const [exportBoothId, setExportBoothId] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ShiftImportPreviewRow[]>([]);
  const [importOverrideDup, setImportOverrideDup] = useState(false);
  const [importUploadKey, setImportUploadKey] = useState(0);
  const [importBusy, setImportBusy] = useState(false);
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const nowTaipei = useMemo(() => {
    void nowTick;
    return dayjs().tz("Asia/Taipei");
  }, [nowTick]);

  const loadCore = useCallback(async () => {
    const [b, u, sh, sw] = await Promise.all([
      listBoothsAdmin(),
      listUsersAdmin(),
      listShiftsInRange(boothFilter, weekStart, weekEnd),
      listSwapRequestsForAdmin(),
    ]);
    setBooths(b);
    setUsers(u);
    setShifts(sh);
    setSwaps(sw);
    const logRows = await listClockLogsForShiftIds(sh.map((x) => x.id));
    setLogs(logRows);

    const ids = new Set<string>();
    for (const r of sw) {
      ids.add(r.requester_shift_id);
      ids.add(r.target_shift_id);
    }
    if (ids.size > 0) {
      const extra = await getShiftsByIds([...ids]);
      setSwapShiftMap(new Map(extra.map((x) => [x.id, x])));
    } else {
      setSwapShiftMap(new Map());
    }
  }, [boothFilter, weekEnd, weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await loadCore();
    } catch (e) {
      message.error(e instanceof Error ? e.message : s.loadError);
      setShifts([]);
      setLogs([]);
      setSwaps([]);
    } finally {
      setLoading(false);
    }
  }, [loadCore, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => groupShiftsByDate(shifts), [shifts]);

  const boothNameById = useMemo(
    () => new Map(booths.map((b) => [b.id, b.name])),
    [booths],
  );

  const userOptionsForBooth = useCallback(
    (boothId: string) => {
      return users.filter(
        (u) =>
          u.role === "ADMIN" || (u.boothIds && u.boothIds.includes(boothId)),
      );
    },
    [users],
  );

  const openCreate = () => {
    setEditingShift(null);
    form.resetFields();
    const b0 = boothFilter ?? booths[0]?.id;
    form.setFieldsValue({
      booth_id: b0,
      user_id: undefined,
      shift_date: dayjs(),
      times: [dayjs().hour(9).minute(0), dayjs().hour(18).minute(0)],
      note: "",
    });
    setModalOpen(true);
  };

  const openEdit = (row: ShiftWithNames) => {
    setEditingShift(row);
    const d = dayjs(row.shift_date);
    form.setFieldsValue({
      user_id: row.user_id,
      booth_id: row.booth_id,
      shift_date: d,
      times: [shiftTimeToDayjs(d, row.start_time), shiftTimeToDayjs(d, row.end_time)],
      note: row.note ?? "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingShift(null);
  };

  const watchedBoothId = Form.useWatch("booth_id", form);
  const watchedShiftDate = Form.useWatch("shift_date", form);

  const shiftBoothActivityWarn = useMemo(() => {
    if (!modalOpen || !watchedBoothId || !watchedShiftDate?.isValid?.()) return null;
    const booth = booths.find((x) => x.id === watchedBoothId);
    if (!booth) return null;
    const rangeLabel = formatBoothActivityRangeLabel(booth.start_date, booth.end_date);
    if (!rangeLabel) return null;
    const d = watchedShiftDate.format("YYYY-MM-DD");
    if (!shiftDateOutsideBoothActivity(d, booth.start_date, booth.end_date)) return null;
    return s.boothDateWarnSave(rangeLabel);
  }, [modalOpen, watchedBoothId, watchedShiftDate, booths]);

  const onSave = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const dateStr = v.shift_date.format("YYYY-MM-DD");
      const start_time = v.times[0].format("HH:mm:ss");
      const end_time = v.times[1].format("HH:mm:ss");
      if (editingShift) {
        await updateShiftAdmin(editingShift.id, {
          user_id: v.user_id,
          booth_id: v.booth_id,
          shift_date: dateStr,
          start_time,
          end_time,
          note: v.note,
        });
        message.success(s.updated);
      } else {
        await createShiftAdmin({
          user_id: v.user_id,
          booth_id: v.booth_id,
          shift_date: dateStr,
          start_time,
          end_time,
          note: v.note,
        });
        message.success(s.created);
      }
      closeModal();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(e instanceof Error ? e.message : s.saveError);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (row: ShiftWithNames) => {
    Modal.confirm({
      title: s.deleteTitle,
      content: s.deleteBody(row.user_name ?? row.user_id),
      okText: common.delete,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteShiftAdmin(row.id);
          message.success(s.deleted);
          await load();
        } catch (e) {
          message.error(e instanceof Error ? e.message : s.deleteError);
        }
      },
    });
  };

  const swapColumns: ColumnsType<SwapRequestListEntry> = [
    { title: s.swapColRequester, dataIndex: "requester_name", key: "rq" },
    { title: s.swapColTarget, dataIndex: "target_name", key: "tg" },
    {
      title: s.swapColStatus,
      key: "st",
      render: (_, r) => {
        if (r.status === "pending") return <Tag>{s.swapStatusPending}</Tag>;
        if (r.status === "accepted") return <Tag color="blue">{s.swapStatusAccepted}</Tag>;
        return <Tag>{r.status}</Tag>;
      },
    },
    {
      title: s.swapColShifts,
      key: "shifts",
      render: (_, r) => {
        const a = swapShiftMap.get(r.requester_shift_id);
        const b = swapShiftMap.get(r.target_shift_id);
        const fmt = (x?: ShiftWithNames) =>
          x
            ? `${x.shift_date} ${formatShiftTime(x.start_time)}–${formatShiftTime(x.end_time)}（${x.booth_name ?? ""}）`
            : "—";
        return (
          <Space direction="vertical" size={0}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {fmt(a)}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {fmt(b)}
            </Text>
          </Space>
        );
      },
    },
    {
      title: s.colActions,
      key: "act",
      width: 220,
      render: (_, r) => (
        <Space wrap>
          {r.status === "accepted" ? (
            <Button
              size="small"
              type="primary"
              onClick={async () => {
                try {
                  await adminApproveShiftSwap(r.id);
                  message.success(s.swapApproved);
                  await load();
                } catch (e) {
                  message.error(e instanceof Error ? e.message : common.requestFailed);
                }
              }}>
              {s.swapApprove}
            </Button>
          ) : null}
          <Button
            size="small"
            danger
            onClick={async () => {
              try {
                await adminRejectShiftSwap(r.id);
                message.success(s.swapRejected);
                await load();
              } catch (e) {
                message.error(e instanceof Error ? e.message : common.requestFailed);
              }
            }}>
            {s.swapReject}
          </Button>
        </Space>
      ),
    },
  ];

  const openImportModal = () => {
    setImportOverrideDup(false);
    setImportPreview([]);
    setImportUploadKey((k) => k + 1);
    setImportOpen(true);
  };

  const closeImportModal = () => {
    setImportOpen(false);
    setImportPreview([]);
    setImportOverrideDup(false);
    setImportUploadKey((k) => k + 1);
  };

  const handleImportBeforeUpload = (file: File) => {
    void (async () => {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".xlsx")) {
        message.error(s.importAcceptXlsx);
        return;
      }
      setImportOverrideDup(false);
      try {
        const ab = await file.arrayBuffer();
        const im = shiftImportValidateMessages();
        const pass1 = parseShiftImportXlsx(ab, users, booths, [], im);
        const dates: string[] = [];
        for (const p of pass1) {
          const d =
            p.payload?.shift_date ??
            parseImportDate(p.raw[SHIFT_IMPORT_HEADERS.date] ?? "") ??
            null;
          if (d) dates.push(d);
        }
        let existingForOverlap: ShiftWithNames[] = [];
        if (dates.length > 0) {
          dates.sort();
          const from = dates[0];
          const to = dates[dates.length - 1];
          existingForOverlap = await listShiftsInRange(null, from, to);
        }
        setImportPreview(parseShiftImportXlsx(ab, users, booths, existingForOverlap, im));
      } catch {
        message.error(s.importParseFailed);
        setImportPreview([]);
      }
    })();
    return false;
  };

  const onConfirmImport = async () => {
    const validRows = importPreview.filter((r) => r.payload && r.errors.length === 0);
    if (validRows.length === 0) return;
    setImportBusy(true);
    try {
      if (importOverrideDup) {
        const dupLabel = s.importDupDb;
        const keysDone = new Set<string>();
        for (const r of validRows) {
          if (!r.warnings.some((w) => w === dupLabel)) continue;
          const p = r.payload!;
          const k = existingShiftKey(p.user_id, p.booth_id, p.shift_date);
          if (keysDone.has(k)) continue;
          keysDone.add(k);
          await deleteShiftsByUserBoothDate(p.user_id, p.booth_id, p.shift_date);
        }
      }
      await insertShiftsAdmin(validRows.map((r) => r.payload!));
      message.success(s.importSuccess(validRows.length));
      closeImportModal();
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : s.importFailed);
    } finally {
      setImportBusy(false);
    }
  };

  const importHasErrors = importPreview.some((r) => r.errors.length > 0);
  const importHasDbDupWarning = importPreview.some(
    (r) => r.payload && r.warnings.length > 0,
  );
  const importValidCount = importPreview.filter((r) => r.payload && r.errors.length === 0).length;
  const importConfirmDisabled =
    importBusy ||
    importValidCount === 0 ||
    importHasErrors ||
    (importHasDbDupWarning && !importOverrideDup);

  const importPreviewColumns: ColumnsType<ShiftImportPreviewRow> = [
    { title: "#", dataIndex: "rowIndex", width: 52 },
    {
      title: SHIFT_IMPORT_HEADERS.name,
      key: "n",
      width: 100,
      render: (_, r) => r.raw[SHIFT_IMPORT_HEADERS.name],
    },
    {
      title: SHIFT_IMPORT_HEADERS.booth,
      key: "b",
      width: 100,
      render: (_, r) => r.raw[SHIFT_IMPORT_HEADERS.booth],
    },
    {
      title: SHIFT_IMPORT_HEADERS.date,
      key: "d",
      width: 108,
      render: (_, r) => r.raw[SHIFT_IMPORT_HEADERS.date],
    },
    {
      title: SHIFT_IMPORT_HEADERS.start,
      key: "s",
      width: 88,
      render: (_, r) => r.raw[SHIFT_IMPORT_HEADERS.start],
    },
    {
      title: SHIFT_IMPORT_HEADERS.end,
      key: "e",
      width: 88,
      render: (_, r) => r.raw[SHIFT_IMPORT_HEADERS.end],
    },
    {
      title: SHIFT_IMPORT_HEADERS.note,
      key: "note",
      ellipsis: true,
      render: (_, r) => r.raw[SHIFT_IMPORT_HEADERS.note],
    },
    {
      title: s.importValidationCol,
      key: "st",
      width: 200,
      render: (_, r) => (
        <Space direction="vertical" size={4}>
          {r.boothDateOutOfRange ? (
            <span title={s.importBoothDateIconTitle}>
              <ExclamationCircleOutlined style={{ color: "#faad14", fontSize: 16 }} />
            </span>
          ) : null}
          {r.errors.map((e, i) => (
            <Tag key={`e${i}`} color="red">
              {e}
            </Tag>
          ))}
          {r.warnings.map((w, i) => (
            <Tag key={`w${i}`} color="orange">
              {w}
            </Tag>
          ))}
          {r.payload && r.errors.length === 0 ? (
            <Tag color="green">{s.importRowOk}</Tag>
          ) : null}
        </Space>
      ),
    },
  ];

  const importFlatErrors = useMemo(
    () =>
      importPreview.flatMap((r) =>
        r.errors.map((e) => (r.rowIndex > 0 ? `第 ${r.rowIndex} 列：${e}` : e)),
      ),
    [importPreview],
  );

  const importFlatWarnings = useMemo(
    () =>
      importPreview.flatMap((r) =>
        r.warnings.map((w) => (r.rowIndex > 0 ? `第 ${r.rowIndex} 列：${w}` : w)),
      ),
    [importPreview],
  );

  const onExportCsv = async () => {
    try {
      const from = exportRange[0].format("YYYY-MM-DD");
      const to = exportRange[1].format("YYYY-MM-DD");
      const rows = await listShiftsInRange(exportBoothId, from, to);
      const logRows = await listClockLogsForShiftIds(rows.map((x) => x.id));
      const csv = buildShiftsClockCsv(rows, logRows, boothNameById);
      const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shifts_${from}_${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(s.exportDone);
    } catch (e) {
      message.error(e instanceof Error ? e.message : s.exportError);
    }
  };

  if (!profile) {
    return (
      <div style={{ padding: 24 }}>
        <Text type="secondary">{common.loading}</Text>
      </div>
    );
  }

  if (!isAdminRole(profile.role)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        }}>
        <div>
          <Title level={3} style={{ marginTop: 0 }}>
            <CalendarOutlined style={{ marginRight: 8 }} />
            {s.pageTitle}
          </Title>
          <Text type="secondary">{s.hint}</Text>
        </div>
        <Button type="default" icon={<UploadOutlined />} onClick={openImportModal}>
          {s.importShifts}
        </Button>
      </div>

      <Card style={{ marginTop: 16 }} loading={loading}>
        <Space wrap style={{ marginBottom: 16 }}>
          <Button icon={<LeftOutlined />} onClick={() => setWeekAnchor((w) => w.subtract(1, "week"))} />
          <Button icon={<RightOutlined />} onClick={() => setWeekAnchor((w) => w.add(1, "week"))} />
          <DatePicker
            picker="week"
            value={weekAnchor}
            onChange={(d) => d && setWeekAnchor(d.startOf("isoWeek"))}
          />
          <Text type="secondary">
            {weekStart} — {weekEnd}
          </Text>
          <Select
            allowClear
            placeholder={s.filterBooth}
            style={{ minWidth: 200 }}
            value={boothFilter ?? undefined}
            onChange={(v) => setBoothFilter(v ?? null)}
            options={booths.map((b) => ({ value: b.id, label: b.name }))}
          />
          <Button type="primary" onClick={openCreate}>
            {s.newShift}
          </Button>
        </Space>

        <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
          {s.consecutiveLegend}
        </Text>

        <Row gutter={[12, 12]}>
          {days.map((d) => {
            const key = d.format("YYYY-MM-DD");
            const list = byDate.get(key) ?? [];
            const consecMeta = consecutiveMetaByShiftId(list);
            return (
              <Col xs={24} sm={12} md={8} lg={6} xl={4} key={key}>
                <Card size="small" title={d.format("ddd MM/DD")}>
                  {list.length === 0 ? (
                    <Text type="secondary">{s.emptyDay}</Text>
                  ) : (
                    <Space direction="vertical" style={{ width: "100%" }} size={8}>
                      {list.map((sh) => {
                        const cm = consecMeta.get(sh.id)!;
                        const consecBg =
                          cm.chainLength > 1 ? { background: "rgba(124, 58, 237, 0.1)" } : undefined;
                        return (
                          <Card key={sh.id} size="small" styles={{ body: { padding: 8 } }} style={consecBg}>
                            <div style={{ fontWeight: 600 }}>{sh.user_name ?? sh.user_id}</div>
                            <div style={{ fontSize: 12, opacity: 0.85 }}>
                              {sh.booth_name ?? boothNameById.get(sh.booth_id)}
                            </div>
                            <div style={{ fontSize: 13 }}>
                              {formatShiftTime(sh.start_time)} – {formatShiftTime(sh.end_time)}
                            </div>
                            {adminShiftStatusTag(sh, consecMeta, logs, nowTaipei)}
                            {sh.note ? (
                              <div style={{ fontSize: 12, marginTop: 4 }}>{sh.note}</div>
                            ) : null}
                            <Space style={{ marginTop: 8 }}>
                              <Button size="small" onClick={() => openEdit(sh)}>
                                {common.edit}
                              </Button>
                              <Button size="small" danger onClick={() => onDelete(sh)}>
                                {common.delete}
                              </Button>
                            </Space>
                          </Card>
                        );
                      })}
                    </Space>
                  )}
                </Card>
              </Col>
            );
          })}
        </Row>
      </Card>

      <Card title={s.swapSectionTitle} style={{ marginTop: 24 }}>
        <Table
          rowKey="id"
          size="small"
          columns={swapColumns}
          dataSource={swaps}
          pagination={false}
          locale={{ emptyText: s.swapEmpty }}
        />
      </Card>

      <Card title={s.exportTitle} style={{ marginTop: 24 }}>
        <Space wrap align="start">
          <DatePicker.RangePicker
            value={exportRange}
            onChange={(r) => {
              if (r?.[0] && r[1]) setExportRange([r[0], r[1]]);
            }}
          />
          <Select
            allowClear
            placeholder={s.filterBooth}
            style={{ minWidth: 200 }}
            value={exportBoothId ?? undefined}
            onChange={(v) => setExportBoothId(v ?? null)}
            options={booths.map((b) => ({ value: b.id, label: b.name }))}
          />
          <Button onClick={() => void onExportCsv()}>{s.exportCsv}</Button>
        </Space>
      </Card>

      <Modal
        title={editingShift ? s.modalEdit : s.modalCreate}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void onSave()}
        confirmLoading={saving}
        destroyOnClose
        width={520}>
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          {shiftBoothActivityWarn ? (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={shiftBoothActivityWarn} />
          ) : null}
          <Form.Item name="booth_id" label={s.labelBooth} rules={[{ required: true }]}>
            <Select
              options={booths.map((b) => ({ value: b.id, label: b.name }))}
              onChange={() => form.setFieldValue("user_id", undefined)}
            />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(p, c) => p.booth_id !== c.booth_id}>
            {() => {
              const bid = form.getFieldValue("booth_id") as string | undefined;
              const opts = bid ? userOptionsForBooth(bid) : users;
              return (
                <Form.Item name="user_id" label={s.labelStaff} rules={[{ required: true }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={opts.map((u) => ({
                      value: u.id,
                      label: `${u.name} (${u.role})`,
                    }))}
                  />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item name="shift_date" label={s.labelDate} rules={[{ required: true }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="times" label={s.labelTimeRange} rules={[{ required: true }]}>
            <TimePicker.RangePicker format="HH:mm" style={{ width: "100%" }} needConfirm />
          </Form.Item>
          <Form.Item name="note" label={s.labelNote}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={s.importModalTitle}
        open={importOpen}
        onCancel={closeImportModal}
        width={960}
        destroyOnClose
        footer={
          <Space>
            <Button onClick={closeImportModal}>{common.cancel}</Button>
            <Button
              type="primary"
              loading={importBusy}
              disabled={importConfirmDisabled}
              onClick={() => void onConfirmImport()}>
              {s.importConfirm}
            </Button>
          </Space>
        }>
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Space wrap>
            <Upload
              key={importUploadKey}
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              showUploadList={false}
              beforeUpload={handleImportBeforeUpload}>
              <Button icon={<UploadOutlined />}>{s.importPickFile}</Button>
            </Upload>
            <Button
              onClick={() => {
                downloadShiftImportTemplate();
              }}>
              {s.importTemplateDownload}
            </Button>
            <Text type="secondary">{s.importAcceptXlsx}</Text>
          </Space>

          {importFlatErrors.length > 0 ? (
            <Alert
              type="error"
              showIcon
              message={s.importErrorsTitle}
              description={
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {importFlatErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              }
            />
          ) : null}

          {importFlatWarnings.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              message={s.importWarningsTitle}
              description={
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {importFlatWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              }
            />
          ) : null}

          <Checkbox
            checked={importOverrideDup}
            onChange={(e) => setImportOverrideDup(e.target.checked)}
            disabled={!importHasDbDupWarning}>
            {s.importOverrideDup}
          </Checkbox>

          <div>
            <Text strong>{s.importPreviewTitle}</Text>
            <Table<ShiftImportPreviewRow>
              style={{ marginTop: 8 }}
              size="small"
              rowKey="rowIndex"
              columns={importPreviewColumns}
              dataSource={importPreview}
              pagination={false}
              scroll={{ x: "max-content" }}
              locale={{ emptyText: s.importNoRows }}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
}
