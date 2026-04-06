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
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  cancelShiftSwapRequest,
  clockShift,
  createShiftSwapRequest,
  listClockLogsForShiftIds,
  listColleagueShiftsForSwap,
  listShiftsInRange,
  listSwapRequestsForUser,
  shiftSwapTargetRespond,
  type ShiftWithNames,
  type SwapRequestListEntry,
} from "../api/shifts";
import { listUsersAdmin } from "../api/usersAdmin";
import {
  minutesRemainingUntilShiftEnd,
  shouldWarnBeforeClockOut,
} from "../lib/clockStatus";
import {
  canClockOnShiftDayTaipei,
  formatShiftTime,
  weekRangeIso,
} from "../lib/shiftCalendar";
import { consecutiveMetaByShiftId, logForShiftSegment } from "../lib/shiftConsecutive";
import { zhtw } from "../locales/zhTW";
import { useAuth } from "../auth/AuthContext";
import { isAdminRole } from "../api/authProfile";
import { Navigate } from "react-router-dom";
import type { ShiftRow } from "../types/supabase";

const { Title, Text } = Typography;
const m = zhtw.admin.myShifts;
const common = zhtw.common;
const posCopy = zhtw.pos;

function clockLabel(
  shiftId: string,
  meta: ReturnType<typeof consecutiveMetaByShiftId>,
  logs: { shift_id: string; clock_in_at: string | null; clock_out_at: string | null }[],
): string {
  const logMap = new Map(logs.map((x) => [x.shift_id, x]));
  const l = logForShiftSegment(shiftId, meta, logMap);
  if (!l || !l.clock_in_at) return m.clockNone;
  if (!l.clock_out_at) return m.clockInAt(l.clock_in_at);
  return m.clockDoneAt(l.clock_out_at);
}

export function MyShiftsPage() {
  const { message } = App.useApp();
  const { profile, session } = useAuth();
  const userId = session?.user.id;

  const [weekAnchor, setWeekAnchor] = useState(() => dayjs());
  const { start: weekStart, end: weekEnd, days } = useMemo(
    () => weekRangeIso(weekAnchor),
    [weekAnchor],
  );

  const [shifts, setShifts] = useState<ShiftWithNames[]>([]);
  const [logs, setLogs] = useState<
    { shift_id: string; clock_in_at: string | null; clock_out_at: string | null }[]
  >([]);
  const [swaps, setSwaps] = useState<SwapRequestListEntry[]>([]);
  const [userNameById, setUserNameById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => dayjs());

  const [swapOpen, setSwapOpen] = useState(false);
  const [swapForm] = Form.useForm<{ mine: string; theirs: string }>();
  const [colleagueShifts, setColleagueShifts] = useState<ShiftRow[]>([]);
  const [loadingColleagues, setLoadingColleagues] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [sh, urows, sw] = await Promise.all([
        listShiftsInRange(null, weekStart, weekEnd),
        listUsersAdmin(),
        listSwapRequestsForUser(userId),
      ]);
      setShifts(sh);
      setSwaps(sw);
      setUserNameById(new Map(urows.map((u) => [u.id, u.name])));
      const logRows = await listClockLogsForShiftIds(sh.map((x) => x.id));
      setLogs(logRows);
    } catch (e) {
      message.error(e instanceof Error ? e.message : m.loadError);
      setShifts([]);
      setLogs([]);
      setSwaps([]);
    } finally {
      setLoading(false);
    }
  }, [message, userId, weekEnd, weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(dayjs()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const byDate = useMemo(() => {
    const map = new Map<string, ShiftWithNames[]>();
    for (const r of shifts) {
      const list = map.get(r.shift_date) ?? [];
      list.push(r);
      map.set(r.shift_date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [shifts]);

  const openSwap = () => {
    swapForm.resetFields();
    setColleagueShifts([]);
    setSwapOpen(true);
  };

  const onMyShiftPicked = async (shiftId: string) => {
    const mine = shifts.find((x) => x.id === shiftId);
    if (!mine) return;
    swapForm.setFieldValue("theirs", undefined);
    setLoadingColleagues(true);
    try {
      const rows = await listColleagueShiftsForSwap(mine.booth_id, weekStart, weekEnd);
      setColleagueShifts(rows);
    } catch (e) {
      message.error(e instanceof Error ? e.message : common.requestFailed);
      setColleagueShifts([]);
    } finally {
      setLoadingColleagues(false);
    }
  };

  const submitSwap = async () => {
    try {
      const v = await swapForm.validateFields();
      await createShiftSwapRequest(v.mine, v.theirs);
      message.success(m.swapSent);
      setSwapOpen(false);
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(e instanceof Error ? e.message : m.swapError);
    }
  };

  const sortedSwaps = useMemo(() => {
    const cp = [...swaps];
    const score = (r: SwapRequestListEntry) => {
      if (userId && r.target_id === userId && r.status === "pending") return 0;
      if (r.status === "pending" || r.status === "accepted") return 1;
      return 2;
    };
    cp.sort((a, b) => {
      const d = score(a) - score(b);
      if (d !== 0) return d;
      return b.created_at.localeCompare(a.created_at);
    });
    return cp;
  }, [swaps, userId]);

  const swapTableCols: ColumnsType<SwapRequestListEntry> = [
    {
      title: m.colRole,
      key: "role",
      render: (_, r) =>
        r.target_id === userId ? <Tag>{m.youAreTarget}</Tag> : <Tag>{m.youAreRequester}</Tag>,
    },
    {
      title: m.colCounterparty,
      key: "cp",
      render: (_, r) =>
        r.target_id === userId ? r.requester_name ?? "—" : r.target_name ?? "—",
    },
    {
      title: m.colStatus,
      key: "st",
      render: (_, r) => {
        if (r.status === "pending") return <Tag>{m.statusPending}</Tag>;
        if (r.status === "accepted") return <Tag color="blue">{m.statusAccepted}</Tag>;
        if (r.status === "approved") return <Tag color="green">{m.statusApproved}</Tag>;
        if (r.status === "rejected") return <Tag color="red">{m.statusRejected}</Tag>;
        if (r.status === "cancelled") return <Tag>{m.statusCancelled}</Tag>;
        return <Tag>{r.status}</Tag>;
      },
    },
    {
      title: m.colActions,
      key: "act",
      width: 280,
      render: (_, r) => (
        <Space wrap>
          {r.target_id === userId && r.status === "pending" ? (
            <>
              <Button
                size="small"
                type="primary"
                onClick={async () => {
                  try {
                    await shiftSwapTargetRespond(r.id, true);
                    message.success(m.accepted);
                    await load();
                  } catch (e) {
                    message.error(e instanceof Error ? e.message : common.requestFailed);
                  }
                }}>
                {m.accept}
              </Button>
              <Button
                size="small"
                danger
                onClick={async () => {
                  try {
                    await shiftSwapTargetRespond(r.id, false);
                    message.success(m.rejected);
                    await load();
                  } catch (e) {
                    message.error(e instanceof Error ? e.message : common.requestFailed);
                  }
                }}>
                {m.reject}
              </Button>
            </>
          ) : null}
          {r.requester_id === userId && (r.status === "pending" || r.status === "accepted") ? (
            <Button
              size="small"
              onClick={async () => {
                try {
                  await cancelShiftSwapRequest(r.id);
                  message.success(m.cancelled);
                  await load();
                } catch (e) {
                  message.error(e instanceof Error ? e.message : common.requestFailed);
                }
              }}>
              {m.cancelRequest}
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  if (!profile || !userId) {
    return (
      <div style={{ padding: 24 }}>
        <Text type="secondary">{common.loading}</Text>
      </div>
    );
  }

  if (isAdminRole(profile.role)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return (
    <div style={{ padding: 24 }}>
      <Title level={3} style={{ marginTop: 0 }}>
        <CalendarOutlined style={{ marginRight: 8 }} />
        {m.pageTitle}
      </Title>
      <Text type="secondary">{m.hint}</Text>

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
          <Button type="primary" onClick={openSwap}>
            {m.proposeSwap}
          </Button>
        </Space>

        <Row gutter={[12, 12]}>
          {days.map((d) => {
            const key = d.format("YYYY-MM-DD");
            const list = byDate.get(key) ?? [];
            const consecMeta = consecutiveMetaByShiftId(list);
            const logMap = new Map(logs.map((l) => [l.shift_id, l]));
            return (
              <Col xs={24} sm={12} md={8} lg={6} xl={4} key={key}>
                <Card size="small" title={d.format("ddd MM/DD")}>
                  {list.length === 0 ? (
                    <Text type="secondary">{m.emptyDay}</Text>
                  ) : (
                    <Space direction="vertical" style={{ width: "100%" }} size={8}>
                      {list.map((sh) => {
                        const cm = consecMeta.get(sh.id)!;
                        const isFollower = cm.chainLength > 1 && cm.indexInChain > 0;
                        const isOwn = sh.user_id === userId;
                        const canClock = isOwn && canClockOnShiftDayTaipei(sh, now);
                        const log = logForShiftSegment(sh.id, consecMeta, logMap);
                        const clockedIn = Boolean(log?.clock_in_at);
                        const clockedOut = Boolean(log?.clock_out_at);
                        const cardStyle: CSSProperties = isOwn
                          ? {
                              background: "rgba(22, 119, 255, 0.08)",
                              borderColor: "#1677ff",
                              boxShadow: "0 0 0 1.5px #1677ff55",
                            }
                          : cm.chainLength > 1
                            ? { background: "rgba(124, 58, 237, 0.1)" }
                            : {};
                        return (
                          <Card key={sh.id} size="small" styles={{ body: { padding: 8 } }} style={cardStyle}>
                            <div style={{ fontWeight: 600 }}>{sh.user_name ?? "—"}</div>
                            <div style={{ fontSize: 12, opacity: 0.9 }}>{sh.booth_name ?? m.booth}</div>
                            <div style={{ fontSize: 13 }}>
                              {formatShiftTime(sh.start_time)} – {formatShiftTime(sh.end_time)}
                            </div>
                            {sh.note ? (
                              <div style={{ fontSize: 12, marginTop: 4 }}>{sh.note}</div>
                            ) : null}
                            <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>
                              {m.clockStatus}：{clockLabel(sh.id, consecMeta, logs)}
                            </div>
                            {isOwn ? (
                              isFollower ? (
                                <Tag color="purple" style={{ marginTop: 8 }}>
                                  {zhtw.admin.shifts.tagConsecutive}
                                </Tag>
                              ) : (
                                <Space style={{ marginTop: 8 }} wrap>
                                  <Button
                                    size="small"
                                    type="primary"
                                    disabled={!canClock || clockedIn}
                                    onClick={async () => {
                                      try {
                                        await clockShift(sh.id, "in");
                                        message.success(m.clockInOk);
                                        await load();
                                      } catch (e) {
                                        message.error(e instanceof Error ? e.message : m.clockError);
                                      }
                                    }}>
                                    {m.clockIn}
                                  </Button>
                                  <Button
                                    size="small"
                                    disabled={!canClock || !clockedIn || clockedOut}
                                    onClick={() => {
                                      void (async () => {
                                        const tail = cm.tail;
                                        const nowTaipei = dayjs().tz("Asia/Taipei");
                                        const doOut = async () => {
                                          await clockShift(sh.id, "out");
                                          message.success(m.clockOutOk);
                                          await load();
                                        };
                                        try {
                                          if (
                                            shouldWarnBeforeClockOut(
                                              nowTaipei,
                                              tail.shift_date,
                                              tail.end_time,
                                            )
                                          ) {
                                            const mins = minutesRemainingUntilShiftEnd(
                                              nowTaipei,
                                              tail.shift_date,
                                              tail.end_time,
                                            );
                                            await new Promise<void>((resolve, reject) => {
                                              Modal.confirm({
                                                title: posCopy.earlyClockOutTitle,
                                                content: posCopy.earlyClockOutWarn(mins),
                                                okText: m.clockOut,
                                                cancelText: common.cancel,
                                                async onOk() {
                                                  try {
                                                    await doOut();
                                                    resolve();
                                                  } catch (e) {
                                                    reject(e);
                                                  }
                                                },
                                                onCancel() {
                                                  resolve();
                                                },
                                              });
                                            });
                                          } else {
                                            await doOut();
                                          }
                                        } catch (e) {
                                          message.error(e instanceof Error ? e.message : m.clockError);
                                        }
                                      })();
                                    }}>
                                    {m.clockOut}
                                  </Button>
                                </Space>
                              )
                            ) : isFollower ? (
                              <Tag color="purple" style={{ marginTop: 8 }}>
                                {zhtw.admin.shifts.tagConsecutive}
                              </Tag>
                            ) : null}
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

      <Card title={m.swapRequestsTitle} style={{ marginTop: 24 }}>
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10 }}
          columns={swapTableCols}
          dataSource={sortedSwaps}
          locale={{ emptyText: m.swapEmpty }}
        />
      </Card>

      <Modal
        title={m.swapModalTitle}
        open={swapOpen}
        onCancel={() => setSwapOpen(false)}
        onOk={() => void submitSwap()}
        destroyOnClose>
        <Form form={swapForm} layout="vertical">
          <Form.Item name="mine" label={m.pickMyShift} rules={[{ required: true }]}>
            <Select
              placeholder={m.pickMyShiftPh}
              options={shifts
                .filter((sh) => sh.user_id === userId)
                .map((sh) => ({
                  value: sh.id,
                  label: `${sh.shift_date} ${formatShiftTime(sh.start_time)}–${formatShiftTime(sh.end_time)} · ${sh.booth_name ?? ""}`,
                }))}
              onChange={(v) => void onMyShiftPicked(v)}
            />
          </Form.Item>
          <Form.Item name="theirs" label={m.pickTheirShift} rules={[{ required: true }]}>
            <Select
              loading={loadingColleagues}
              placeholder={m.pickTheirShiftPh}
              options={colleagueShifts.map((sh) => ({
                value: sh.id,
                label: `${userNameById.get(sh.user_id) ?? sh.user_id} · ${sh.shift_date} ${formatShiftTime(sh.start_time)}–${formatShiftTime(sh.end_time)}`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
