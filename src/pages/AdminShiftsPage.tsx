import {
  CalendarOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
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
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { listBoothsAdmin } from "../api/boothsAdmin";
import {
  adminApproveShiftSwap,
  adminRejectShiftSwap,
  buildShiftsClockCsv,
  createShiftAdmin,
  deleteShiftAdmin,
  getShiftsByIds,
  listClockLogsForShiftIds,
  listShiftsInRange,
  listSwapRequestsForAdmin,
  updateShiftAdmin,
  type ShiftWithNames,
  type SwapRequestListEntry,
} from "../api/shifts";
import { listUsersAdmin, type AdminUserListEntry } from "../api/usersAdmin";
import { formatShiftTime, weekRangeIso } from "../lib/shiftCalendar";
import { zhtw } from "../locales/zhTW";
import { isAdminRole } from "../api/authProfile";
import { useAuth } from "../auth/AuthContext";

const { Title, Text } = Typography;
const s = zhtw.admin.shifts;
const common = zhtw.common;

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

function clockStatus(
  shiftId: string,
  logs: { shift_id: string; clock_in_at: string | null; clock_out_at: string | null }[],
): string {
  const l = logs.find((x) => x.shift_id === shiftId);
  if (!l || !l.clock_in_at) return s.clockNone;
  if (!l.clock_out_at) return s.clockInOnly;
  return s.clockDone;
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
  const [booths, setBooths] = useState<{ id: string; name: string }[]>([]);
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
      <Title level={3} style={{ marginTop: 0 }}>
        <CalendarOutlined style={{ marginRight: 8 }} />
        {s.pageTitle}
      </Title>
      <Text type="secondary">{s.hint}</Text>

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

        <Row gutter={[12, 12]}>
          {days.map((d) => {
            const key = d.format("YYYY-MM-DD");
            const list = byDate.get(key) ?? [];
            return (
              <Col xs={24} sm={12} md={8} lg={6} xl={4} key={key}>
                <Card size="small" title={d.format("ddd MM/DD")}>
                  {list.length === 0 ? (
                    <Text type="secondary">{s.emptyDay}</Text>
                  ) : (
                    <Space direction="vertical" style={{ width: "100%" }} size={8}>
                      {list.map((sh) => (
                        <Card key={sh.id} size="small" styles={{ body: { padding: 8 } }}>
                          <div style={{ fontWeight: 600 }}>{sh.user_name ?? sh.user_id}</div>
                          <div style={{ fontSize: 12, opacity: 0.85 }}>
                            {sh.booth_name ?? boothNameById.get(sh.booth_id)}
                          </div>
                          <div style={{ fontSize: 13 }}>
                            {formatShiftTime(sh.start_time)} – {formatShiftTime(sh.end_time)}
                          </div>
                          <Tag style={{ marginTop: 4 }}>{clockStatus(sh.id, logs)}</Tag>
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
                      ))}
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
    </div>
  );
}
