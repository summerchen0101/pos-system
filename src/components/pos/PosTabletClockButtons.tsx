import { App, Button, Form, Input, Modal } from "antd";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useState } from "react";
import { taipeiTodayIso } from "../../api/clockLogsReport";
import { clockShiftWithClient, listShiftsInRangeWithClient } from "../../api/shifts";
import { usePosCashier } from "../../context/PosCashierContext";
import { shouldWarnBeforeClockOut } from "../../lib/clockStatus";
import { buildConsecutiveChains } from "../../lib/shiftConsecutive";
import { createEphemeralSupabaseClient } from "../../supabaseEphemeral";
import { zhtw } from "../../locales/zhTW";

dayjs.extend(utc);
dayjs.extend(timezone);

const p = zhtw.pos;

function formatHmTaipei(): string {
  return dayjs().tz("Asia/Taipei").format("HH:mm");
}

async function ephemeralSignIn(username: string, password: string) {
  const client = createEphemeralSupabaseClient();
  const u = username.trim();
  if (!u) {
    throw new Error("bad_creds");
  }
  const { data: emailData, error: r1 } = await client.rpc("get_auth_email_by_username", {
    p_username: u,
  });
  if (r1 || typeof emailData !== "string" || emailData.length === 0) {
    throw new Error("bad_creds");
  }
  const { error: r2 } = await client.auth.signInWithPassword({
    email: emailData,
    password,
  });
  if (r2) {
    throw new Error("bad_creds");
  }
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw new Error("bad_creds");
  }
  const { data: urow } = await client.from("users").select("name").eq("id", user.id).maybeSingle();
  return { client, userId: user.id, name: urow?.name ?? user.id };
}

export function PosTabletClockButtons({
  boothId,
  onClockRecordsChanged,
}: {
  boothId: string;
  /** Called after a successful clock-in or clock-out (modal closed). */
  onClockRecordsChanged?: () => void;
}) {
  const { message } = App.useApp();
  const { setCashier } = usePosCashier();

  const [inOpen, setInOpen] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  const [inLoading, setInLoading] = useState(false);
  const [outLoading, setOutLoading] = useState(false);
  const [inForm] = Form.useForm<{ username: string; password: string }>();
  const [outForm] = Form.useForm<{ username: string; password: string }>();

  const submitClockIn = async (values: { username: string; password: string }) => {
    const today = taipeiTodayIso();
    setInLoading(true);
    let client: Awaited<ReturnType<typeof createEphemeralSupabaseClient>> | null = null;
    try {
      const auth = await ephemeralSignIn(values.username, values.password);
      client = auth.client;
      const { userId, name } = auth;

      const shifts = await listShiftsInRangeWithClient(client, boothId, today, today, { userId });
      if (shifts.length > 0) {
        const sorted = [...shifts].sort((a, b) => a.start_time.localeCompare(b.start_time));
        const chains = buildConsecutiveChains(sorted);
        const headId = chains[0]![0]!.id;
        try {
          await clockShiftWithClient(client, headId, "in");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("already_clocked_in")) {
            const { data: log } = await client
              .from("shift_clock_logs")
              .select("clock_in_at")
              .eq("shift_id", headId)
              .maybeSingle();
            const t = log?.clock_in_at
              ? dayjs(log.clock_in_at).tz("Asia/Taipei").format("YYYY-MM-DD HH:mm")
              : "";
            message.info(p.tabletAlreadyClockedIn(name, t));
            return;
          }
          throw e;
        }
      } else {
        const { error } = await client.rpc("pos_adhoc_clock_in", { p_booth_id: boothId });
        if (error) {
          if (error.message.includes("pos_already_clocked_in")) {
            const { data: log } = await client
              .from("shift_clock_logs")
              .select("clock_in_at")
              .eq("user_id", userId)
              .is("shift_id", null)
              .eq("booth_id", boothId)
              .eq("work_date", today)
              .maybeSingle();
            const t = log?.clock_in_at
              ? dayjs(log.clock_in_at).tz("Asia/Taipei").format("YYYY-MM-DD HH:mm")
              : "";
            message.info(p.tabletAlreadyClockedIn(name, t));
            return;
          }
          throw error;
        }
      }
      setCashier({ userId, name });
      message.success(p.tabletClockInOk(name, formatHmTaipei()));
      inForm.resetFields();
      setInOpen(false);
      onClockRecordsChanged?.();
    } finally {
      await client?.auth.signOut({ scope: "local" }).catch(() => undefined);
      setInLoading(false);
    }
  };

  const submitClockOut = async (values: { username: string; password: string }) => {
    const today = taipeiTodayIso();
    setOutLoading(true);
    let client: Awaited<ReturnType<typeof createEphemeralSupabaseClient>> | null = null;
    try {
      const auth = await ephemeralSignIn(values.username, values.password);
      client = auth.client;
      const { userId, name } = auth;
      const { data: logs, error: qErr } = await client
        .from("shift_clock_logs")
        .select(
          "id, shift_id, booth_id, work_date, shifts( booth_id, shift_date, end_time )",
        )
        .eq("user_id", userId)
        .is("clock_out_at", null)
        .not("clock_in_at", "is", null);

      if (qErr) throw qErr;

      type LogRow = {
        id: string;
        shift_id: string | null;
        booth_id: string | null;
        work_date: string | null;
        shifts: { booth_id: string; shift_date: string; end_time: string } | null;
      };

      const open = (logs ?? []).find((raw) => {
        const row = raw as unknown as LogRow;
        if (row.shift_id) {
          const s = row.shifts;
          return s?.booth_id === boothId && s?.shift_date === today;
        }
        return row.booth_id === boothId && row.work_date === today;
      }) as LogRow | undefined;

      if (!open) {
        message.error(p.tabletNoClockInForOut);
        return;
      }

      let tailForWarn: { shift_date: string; end_time: string } | null = null;
      if (open.shift_id) {
        const dayShifts = await listShiftsInRangeWithClient(client, boothId, today, today, {
          userId,
        });
        const sorted = [...dayShifts].sort((a, b) => a.start_time.localeCompare(b.start_time));
        const chains = buildConsecutiveChains(sorted);
        const chain = chains.find((c) => c.some((s) => s.id === open.shift_id));
        if (chain?.length) {
          const tail = chain[chain.length - 1]!;
          tailForWarn = { shift_date: tail.shift_date, end_time: tail.end_time };
        }
      }

      const { error } = await client.rpc("pos_tablet_clock_out", { p_booth_id: boothId });
      if (error) {
        if (error.message.includes("pos_no_clock_in")) {
          message.error(p.tabletNoClockInForOut);
          return;
        }
        throw error;
      }

      const nowTz = dayjs().tz("Asia/Taipei");
      if (
        tailForWarn &&
        shouldWarnBeforeClockOut(nowTz, tailForWarn.shift_date, tailForWarn.end_time)
      ) {
        message.warning(p.tabletEarlyClockOutToast);
      }

      message.success(p.tabletClockOutOk(name, formatHmTaipei()));
      outForm.resetFields();
      setOutOpen(false);
      onClockRecordsChanged?.();
    } finally {
      await client?.auth.signOut({ scope: "local" }).catch(() => undefined);
      setOutLoading(false);
    }
  };

  return (
    <>
      <Button type="default" size="small" onClick={() => setInOpen(true)}>
        {p.clockInBtn}
      </Button>
      <Button type="default" size="small" onClick={() => setOutOpen(true)}>
        {p.clockOutBtn}
      </Button>

      <Modal
        title={p.tabletClockInModalTitle}
        open={inOpen}
        onCancel={() => setInOpen(false)}
        footer={null}
        destroyOnClose>
        <Form
          form={inForm}
          layout="vertical"
          onFinish={(v) => {
            void (async () => {
              try {
                await submitClockIn(v);
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                message.error(
                  msg === "bad_creds" ? p.tabletBadCredentials : msg || p.swapClockLoadError,
                );
              }
            })();
          }}>
          <Form.Item
            name="username"
            label={p.swapClockUsername}
            rules={[{ required: true, message: zhtw.common.required }]}>
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            label={p.swapClockPassword}
            rules={[{ required: true, message: zhtw.common.required }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={inLoading} block>
            {p.clockInBtn}
          </Button>
        </Form>
      </Modal>

      <Modal
        title={p.tabletClockOutModalTitle}
        open={outOpen}
        onCancel={() => setOutOpen(false)}
        footer={null}
        destroyOnClose>
        <Form
          form={outForm}
          layout="vertical"
          onFinish={(v) => {
            void (async () => {
              try {
                await submitClockOut(v);
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                message.error(
                  msg === "bad_creds" ? p.tabletBadCredentials : msg || p.swapClockLoadError,
                );
              }
            })();
          }}>
          <Form.Item
            name="username"
            label={p.swapClockUsername}
            rules={[{ required: true, message: zhtw.common.required }]}>
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            label={p.swapClockPassword}
            rules={[{ required: true, message: zhtw.common.required }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={outLoading} block>
            {p.clockOutBtn}
          </Button>
        </Form>
      </Modal>
    </>
  );
}
