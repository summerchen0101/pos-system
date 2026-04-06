import { App, Button, Form, Input, Modal, Space, Spin, Typography } from "antd";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useCallback, useEffect, useState } from "react";
import { isAdminRole, type UserProfile } from "../../api/authProfile";
import {
  chainHeadId,
  formatMergedShiftRange,
  loadPosClockState,
  loadPosClockStateWithClient,
  posClockIn,
  posClockOut,
  type PosClockState,
} from "../../lib/posClock";
import { createEphemeralSupabaseClient } from "../../supabaseEphemeral";
import { supabase } from "../../supabase";
import { useAuth } from "../../auth/AuthContext";
import { zhtw } from "../../locales/zhTW";

dayjs.extend(utc);
dayjs.extend(timezone);

const p = zhtw.pos;

function canUseClock(profile: UserProfile | null, boothId: string): boolean {
  if (!profile) return false;
  if (isAdminRole(profile.role)) return false;
  return profile.boothIds.includes(boothId);
}

function formatHmNow(): string {
  return dayjs().tz("Asia/Taipei").format("HH:mm");
}

export function PosClockActions({ boothId }: { boothId: string }) {
  const { message } = App.useApp();
  const { profile, session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [selfOpen, setSelfOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [selfLoading, setSelfLoading] = useState(false);
  const [swapLoading, setSwapLoading] = useState(false);
  const [selfState, setSelfState] = useState<PosClockState | null>(null);
  const [swapForm] = Form.useForm<{ username: string; password: string }>();

  const refreshSelf = useCallback(async () => {
    if (!userId) return;
    setSelfLoading(true);
    try {
      const { state } = await loadPosClockState(boothId, userId);
      setSelfState(state);
    } catch {
      setSelfState(null);
      message.error(p.swapClockLoadError);
    } finally {
      setSelfLoading(false);
    }
  }, [boothId, message, userId]);

  useEffect(() => {
    if (selfOpen) {
      setSelfState(null);
      void refreshSelf();
    }
  }, [selfOpen, refreshSelf]);

  if (!profile || !canUseClock(profile, boothId)) {
    return null;
  }

  const onSelfClockIn = async () => {
    if (!userId || selfState?.kind !== "clock_in") return;
    try {
      await posClockIn(supabase, chainHeadId(selfState.chain));
      message.success(`${p.clockInOkToast} ${formatHmNow()}`);
      setSelfOpen(false);
      setSelfState(null);
    } catch (e) {
      message.error(e instanceof Error ? e.message : p.swapClockLoadError);
    }
  };

  const onSelfClockOut = async () => {
    if (!userId || selfState?.kind !== "clock_out") return;
    try {
      await posClockOut(supabase, chainHeadId(selfState.chain));
      message.success(`${p.clockOutOkToast} ${formatHmNow()}`);
      setSelfOpen(false);
      setSelfState(null);
    } catch (e) {
      message.error(e instanceof Error ? e.message : p.swapClockLoadError);
    }
  };

  const onSwapSubmit = async (values: { username: string; password: string }) => {
    const ephemeral = createEphemeralSupabaseClient();
    setSwapLoading(true);
    try {
      const u = values.username.trim();
      if (!u) {
        message.error(zhtw.auth.loginInvalidCredentials);
        return;
      }
      const { data: emailData, error: r1 } = await ephemeral.rpc("get_auth_email_by_username", {
        p_username: u,
      });
      if (r1 || typeof emailData !== "string" || emailData.length === 0) {
        message.error(zhtw.auth.loginInvalidCredentials);
        return;
      }
      const { error: r2 } = await ephemeral.auth.signInWithPassword({
        email: emailData,
        password: values.password,
      });
      if (r2) {
        message.error(zhtw.auth.loginInvalidCredentials);
        return;
      }
      const {
        data: { user },
      } = await ephemeral.auth.getUser();
      if (!user) {
        message.error(p.swapClockLoadError);
        return;
      }
      const { data: urow } = await ephemeral.from("users").select("name").eq("id", user.id).maybeSingle();
      const dispName = urow?.name ?? user.id;

      const { state } = await loadPosClockStateWithClient(ephemeral, boothId, user.id);

      if (state.kind === "no_shift") {
        message.error(p.swapClockNoShift);
        return;
      }
      if (state.kind === "done") {
        message.warning(
          p.swapClockAlreadyDone(
            dayjs(state.lastClockOutAt).tz("Asia/Taipei").format("YYYY-MM-DD HH:mm"),
          ),
        );
        return;
      }

      const hm = formatHmNow();
      if (state.kind === "clock_in") {
        await posClockIn(ephemeral, chainHeadId(state.chain));
        message.success(p.swapClockInSuccess(dispName, hm));
      } else {
        await posClockOut(ephemeral, chainHeadId(state.chain));
        message.success(p.swapClockOutSuccess(dispName, hm));
      }
      swapForm.resetFields();
      setSwapOpen(false);
    } catch (e) {
      message.error(e instanceof Error ? e.message : p.swapClockLoadError);
    } finally {
      await ephemeral.auth.signOut({ scope: "local" }).catch(() => undefined);
      setSwapLoading(false);
    }
  };

  return (
    <>
      <Space wrap size={8}>
        <Button type="default" size="small" onClick={() => setSelfOpen(true)}>
          {p.clockOpen}
        </Button>
        <Button type="default" size="small" onClick={() => setSwapOpen(true)}>
          {p.swapClockOpen}
        </Button>
      </Space>

      <Modal
        title={p.clockModalTitle}
        open={selfOpen}
        onCancel={() => setSelfOpen(false)}
        footer={null}
        destroyOnClose>
        {selfLoading ? (
          <div style={{ textAlign: "center", padding: 24 }}>
            <Spin />
          </div>
        ) : selfState == null ? (
          <Typography.Text type="secondary">{p.swapClockLoadError}</Typography.Text>
        ) : (
          <SelfModalBody
            state={selfState}
            onClockIn={() => void onSelfClockIn()}
            onClockOut={() => void onSelfClockOut()}
          />
        )}
      </Modal>

      <Modal
        title={p.swapClockModalTitle}
        open={swapOpen}
        onCancel={() => {
          setSwapOpen(false);
          swapForm.resetFields();
        }}
        footer={null}
        destroyOnClose>
        <Form form={swapForm} layout="vertical" onFinish={(v) => void onSwapSubmit(v)}>
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
          <Button type="primary" htmlType="submit" loading={swapLoading} block>
            {p.swapClockSubmit}
          </Button>
        </Form>
      </Modal>
    </>
  );
}

function SelfModalBody({
  state,
  onClockIn,
  onClockOut,
}: {
  state: PosClockState;
  onClockIn: () => void;
  onClockOut: () => void;
}) {
  if (state.kind === "no_shift") {
    return <Typography.Text type="secondary">{p.clockNoShiftToday}</Typography.Text>;
  }
  if (state.kind === "done") {
    return (
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {state.chain.length > 1 ? (
          <Typography.Text type="secondary">{p.mergedShiftLine(formatMergedShiftRange(state.chain))}</Typography.Text>
        ) : null}
        <Typography.Text>{p.clockDoneToday}</Typography.Text>
        <Typography.Text type="secondary">
          {p.clockOutTime(dayjs(state.lastClockOutAt).tz("Asia/Taipei").format("HH:mm"))}
        </Typography.Text>
      </Space>
    );
  }
  if (state.kind === "clock_in") {
    return (
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {state.chain.length > 1 ? (
          <Typography.Text type="secondary">{p.mergedShiftLine(formatMergedShiftRange(state.chain))}</Typography.Text>
        ) : null}
        <Button type="primary" size="large" block onClick={onClockIn}>
          {p.clockInBtn}
        </Button>
      </Space>
    );
  }
  const log = state.log;
  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {state.chain.length > 1 ? (
        <Typography.Text type="secondary">{p.mergedShiftLine(formatMergedShiftRange(state.chain))}</Typography.Text>
      ) : null}
      {log.clock_in_at ? (
        <Typography.Text type="secondary">
          {p.clockInTime(dayjs(log.clock_in_at).tz("Asia/Taipei").format("HH:mm"))}
        </Typography.Text>
      ) : null}
      <Button type="primary" size="large" block onClick={onClockOut}>
        {p.clockOutBtn}
      </Button>
    </Space>
  );
}
