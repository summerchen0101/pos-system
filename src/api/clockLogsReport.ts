import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { supabase } from "../supabase";
import {
  computeClockInEventStatus,
  computeClockOutEventStatus,
  type ClockEventUiStatus,
} from "../lib/clockStatus";
import { buildConsecutiveChains } from "../lib/shiftConsecutive";
import type { ShiftWithNames } from "./shifts";
import type { ShiftClockLogRow, ShiftRow } from "../types/supabase";

dayjs.extend(utc);
dayjs.extend(timezone);

export type { ClockEventUiStatus } from "../lib/clockStatus";

export type ClockLogEventKind = "in" | "out";

export type ClockLogReportRow = {
  rowKey: string;
  log_id: string;
  user_id: string;
  booth_id: string | null;
  user_name: string | null;
  booth_name: string | null;
  kind: ClockLogEventKind;
  punched_at: string;
  status: ClockEventUiStatus;
  shift_id: string | null;
};

export function taipeiTodayIso(): string {
  return dayjs().tz("Asia/Taipei").format("YYYY-MM-DD");
}

function taipeiDateIso(iso: string): string {
  return dayjs(iso).tz("Asia/Taipei").format("YYYY-MM-DD");
}

function inTaipeiDateRange(iso: string, fromDate: string, toDate: string): boolean {
  const d = taipeiDateIso(iso);
  return d >= fromDate && d <= toDate;
}

function relOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

type LogSelectRow = ShiftClockLogRow & {
  users: { name: string } | { name: string }[] | null;
  booths: { name: string } | { name: string }[] | null;
  shifts:
    | Pick<ShiftRow, "id" | "user_id" | "booth_id" | "shift_date" | "start_time" | "end_time">
    | Pick<ShiftRow, "id" | "user_id" | "booth_id" | "shift_date" | "start_time" | "end_time">[]
    | null;
};

const LOG_SELECT = `
  id,
  shift_id,
  user_id,
  booth_id,
  work_date,
  clock_in_at,
  clock_out_at,
  users (name),
  booths (name),
  shifts:shift_id (
    id,
    user_id,
    booth_id,
    shift_date,
    start_time,
    end_time
  )
`;

async function fetchLogsTouchingUtcWindow(
  queryFromIso: string,
  queryToIso: string,
  userId: string | null | undefined,
): Promise<LogSelectRow[]> {
  let qIn = supabase
    .from("shift_clock_logs")
    .select(LOG_SELECT)
    .not("clock_in_at", "is", null)
    .gte("clock_in_at", queryFromIso)
    .lte("clock_in_at", queryToIso);
  let qOut = supabase
    .from("shift_clock_logs")
    .select(LOG_SELECT)
    .not("clock_out_at", "is", null)
    .gte("clock_out_at", queryFromIso)
    .lte("clock_out_at", queryToIso);

  if (userId) {
    qIn = qIn.eq("user_id", userId);
    qOut = qOut.eq("user_id", userId);
  }

  const [rIn, rOut] = await Promise.all([qIn, qOut]);
  if (rIn.error) throw rIn.error;
  if (rOut.error) throw rOut.error;

  const byId = new Map<string, LogSelectRow>();
  for (const row of (rIn.data ?? []) as LogSelectRow[]) {
    byId.set(row.id, row);
  }
  for (const row of (rOut.data ?? []) as LogSelectRow[]) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

function shiftChainsMetaForLogs(logs: LogSelectRow[]): {
  keys: Set<string>;
  dates: string[];
  userIds: string[];
} {
  const keys = new Set<string>();
  for (const log of logs) {
    const s = relOne(log.shifts);
    if (s) keys.add(`${s.user_id}|${s.booth_id}|${s.shift_date}`);
  }
  const dates = new Set<string>();
  const userIds = new Set<string>();
  for (const k of keys) {
    const [u, , d] = k.split("|");
    if (d) dates.add(d);
    if (u) userIds.add(u);
  }
  return { keys, dates: [...dates], userIds: [...userIds] };
}

export type ListClockLogReportOptions = {
  fromDate: string;
  toDate: string;
  boothId?: string | null;
  userId?: string | null;
};

export async function listClockLogReportRows(opts: ListClockLogReportOptions): Promise<ClockLogReportRow[]> {
  const fromStart = dayjs.tz(`${opts.fromDate}T00:00:00`, "Asia/Taipei");
  const toEnd = dayjs.tz(`${opts.toDate}T23:59:59.999`, "Asia/Taipei");
  const queryFrom = fromStart.subtract(1, "day").toISOString();
  const queryTo = toEnd.add(1, "day").toISOString();

  let logs = await fetchLogsTouchingUtcWindow(queryFrom, queryTo, opts.userId);

  if (opts.boothId) {
    logs = logs.filter((log) => {
      const s = relOne(log.shifts);
      const b = log.booth_id ?? s?.booth_id ?? null;
      return b === opts.boothId;
    });
  }

  const { keys, dates, userIds } = shiftChainsMetaForLogs(logs);

  let chainEndByShiftId = new Map<string, { end_time: string; shift_date: string }>();
  if (keys.size > 0 && dates.length > 0 && userIds.length > 0) {
    const { data: shiftRows, error: se } = await supabase
      .from("shifts")
      .select("id, user_id, booth_id, shift_date, start_time, end_time")
      .in("shift_date", dates)
      .in("user_id", userIds);
    if (se) throw se;
    const filtered = (shiftRows ?? []).filter((r) =>
      keys.has(`${r.user_id}|${r.booth_id}|${r.shift_date}`),
    ) as ShiftRow[];
    const forChains: ShiftWithNames[] = filtered.map((s) => ({
      ...s,
      user_name: null,
      booth_name: null,
    }));
    const byKey = new Map<string, ShiftWithNames[]>();
    for (const s of forChains) {
      const k = `${s.user_id}|${s.booth_id}|${s.shift_date}`;
      const arr = byKey.get(k) ?? [];
      arr.push(s);
      byKey.set(k, arr);
    }
    for (const arr of byKey.values()) {
      arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
      const chains = buildConsecutiveChains(arr);
      for (const chain of chains) {
        const head = chain[0]!;
        const tail = chain[chain.length - 1]!;
        chainEndByShiftId.set(head.id, { end_time: tail.end_time, shift_date: tail.shift_date });
      }
    }
  }

  const rows: ClockLogReportRow[] = [];

  for (const log of logs) {
    const shift = relOne(log.shifts);
    const hasSchedule = shift != null;
    const u = relOne(log.users);
    const b = relOne(log.booths);
    const userName = u?.name ?? null;
    const boothName = b?.name ?? null;

    if (log.clock_in_at && inTaipeiDateRange(log.clock_in_at, opts.fromDate, opts.toDate)) {
      const status = computeClockInEventStatus(
        hasSchedule,
        shift?.shift_date ?? opts.fromDate,
        shift?.start_time ?? "00:00:00",
        log.clock_in_at,
      );
      rows.push({
        rowKey: `${log.id}:in`,
        log_id: log.id,
        user_id: log.user_id,
        booth_id: log.booth_id ?? shift?.booth_id ?? null,
        user_name: userName,
        booth_name: boothName,
        kind: "in",
        punched_at: log.clock_in_at,
        status,
        shift_id: log.shift_id,
      });
    }

    if (log.clock_out_at && inTaipeiDateRange(log.clock_out_at, opts.fromDate, opts.toDate)) {
      let status: ClockEventUiStatus = "ok";
      if (hasSchedule && shift) {
        const tail = chainEndByShiftId.get(shift.id) ?? {
          end_time: shift.end_time,
          shift_date: shift.shift_date,
        };
        status = computeClockOutEventStatus(true, tail.shift_date, tail.end_time, log.clock_out_at);
      }
      rows.push({
        rowKey: `${log.id}:out`,
        log_id: log.id,
        user_id: log.user_id,
        booth_id: log.booth_id ?? shift?.booth_id ?? null,
        user_name: userName,
        booth_name: boothName,
        kind: "out",
        punched_at: log.clock_out_at,
        status,
        shift_id: log.shift_id,
      });
    }
  }

  rows.sort((a, b) => (a.punched_at > b.punched_at ? -1 : a.punched_at < b.punched_at ? 1 : 0));

  return rows;
}

/** 今日有排班（連班算一筆頭班）但該頭班無上班打卡的人次。 */
export async function countMissingScheduledClockInsToday(opts: {
  todayIso: string;
  boothId?: string | null;
  userId?: string | null;
}): Promise<number> {
  let q = supabase
    .from("shifts")
    .select("id, user_id, booth_id, shift_date, start_time, end_time")
    .eq("shift_date", opts.todayIso);

  if (opts.boothId) q = q.eq("booth_id", opts.boothId);
  if (opts.userId) q = q.eq("user_id", opts.userId);

  const { data, error } = await q;
  if (error) throw error;
  const rawShifts = (data ?? []) as ShiftRow[];

  const byKey = new Map<string, ShiftRow[]>();
  for (const s of rawShifts) {
    const k = `${s.user_id}|${s.booth_id}|${s.shift_date}`;
    const arr = byKey.get(k) ?? [];
    arr.push(s);
    byKey.set(k, arr);
  }

  const headIds: string[] = [];
  for (const arr of byKey.values()) {
    arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
    const chains = buildConsecutiveChains(
      arr.map((s) => ({ ...s, user_name: null, booth_name: null })),
    );
    for (const chain of chains) {
      headIds.push(chain[0]!.id);
    }
  }

  if (headIds.length === 0) return 0;

  const { data: logRows, error: le } = await supabase
    .from("shift_clock_logs")
    .select("shift_id, clock_in_at")
    .in("shift_id", headIds);
  if (le) throw le;
  const logByShift = new Map((logRows ?? []).map((l) => [l.shift_id as string, l]));

  let missing = 0;
  for (const hid of headIds) {
    const l = logByShift.get(hid);
    if (!l?.clock_in_at) missing += 1;
  }
  return missing;
}

export type ClockSummaryToday = {
  presentUserIds: number;
  lateUserIds: number;
  missingShiftCount: number;
  earlyClockOutUserIds: number;
};

export function summarizeTodayEventRows(
  rows: ClockLogReportRow[],
  missingClockInSlots: number,
  todayIso: string,
): ClockSummaryToday {
  const present = new Set<string>();
  const late = new Set<string>();
  const earlyOut = new Set<string>();

  for (const r of rows) {
    if (taipeiDateIso(r.punched_at) !== todayIso) continue;
    if (r.kind === "in") {
      present.add(r.user_id);
      if (r.status === "late" || r.status === "very_late") late.add(r.user_id);
    } else if (r.kind === "out" && r.status === "early") {
      earlyOut.add(r.user_id);
    }
  }

  return {
    presentUserIds: present.size,
    lateUserIds: late.size,
    missingShiftCount: missingClockInSlots,
    earlyClockOutUserIds: earlyOut.size,
  };
}
