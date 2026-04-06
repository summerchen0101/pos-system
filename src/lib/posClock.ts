import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clockShiftWithClient,
  listClockLogsForShiftIds,
  listClockLogsForShiftIdsWithClient,
  listShiftsInRange,
  listShiftsInRangeWithClient,
  type ShiftWithNames,
} from "../api/shifts";
import { formatShiftTime } from "./shiftCalendar";
import { taipeiTodayIso } from "../api/clockLogsReport";
import { buildConsecutiveChains } from "./shiftConsecutive";
import type { Database } from "../types/supabase";
import type { ShiftClockLogRow } from "../types/supabase";

export type ShiftChain = ShiftWithNames[];

export type PosClockState =
  | { kind: "no_shift" }
  | { kind: "done"; chain: ShiftChain; lastClockOutAt: string }
  | { kind: "clock_in"; chain: ShiftChain }
  | { kind: "clock_out"; chain: ShiftChain; log: ShiftClockLogRow };

/** Head shift id for RPC (consecutive segments resolve to same log on server). */
export function chainHeadId(chain: ShiftChain): string {
  return chain[0]!.id;
}

export function formatMergedShiftRange(chain: ShiftChain): string {
  const head = chain[0]!;
  const tail = chain[chain.length - 1]!;
  return `${formatShiftTime(head.start_time)}–${formatShiftTime(tail.end_time)}`;
}

export function interpretPosClockState(
  shifts: ShiftWithNames[],
  logs: ShiftClockLogRow[],
): PosClockState {
  if (shifts.length === 0) return { kind: "no_shift" };
  const sorted = [...shifts].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const chains = buildConsecutiveChains(sorted);
  const logByShift = new Map(
    logs.filter((l): l is typeof l & { shift_id: string } => l.shift_id != null).map((l) => [l.shift_id, l]),
  );

  for (const chain of chains) {
    const head = chain[0]!;
    const log = logByShift.get(head.id);
    if (!log?.clock_in_at) {
      return { kind: "clock_in", chain };
    }
    if (!log.clock_out_at) {
      return { kind: "clock_out", chain, log };
    }
  }

  const lastChain = chains[chains.length - 1]!;
  const head = lastChain[0]!;
  const lastLog = logByShift.get(head.id)!;
  return {
    kind: "done",
    chain: lastChain,
    lastClockOutAt: lastLog.clock_out_at!,
  };
}

export async function loadPosClockState(
  boothId: string,
  userId: string,
  dateIso: string = taipeiTodayIso(),
): Promise<{ state: PosClockState; shifts: ShiftWithNames[]; logs: ShiftClockLogRow[] }> {
  const shifts = await listShiftsInRange(boothId, dateIso, dateIso, { userId });
  const logs = await listClockLogsForShiftIds(shifts.map((s) => s.id));
  return {
    state: interpretPosClockState(shifts, logs),
    shifts,
    logs,
  };
}

export async function loadPosClockStateWithClient(
  client: SupabaseClient<Database>,
  boothId: string,
  userId: string,
  dateIso: string = taipeiTodayIso(),
): Promise<{ state: PosClockState; shifts: ShiftWithNames[]; logs: ShiftClockLogRow[] }> {
  const shifts = await listShiftsInRangeWithClient(client, boothId, dateIso, dateIso, { userId });
  const logs = await listClockLogsForShiftIdsWithClient(
    client,
    shifts.map((s) => s.id),
  );
  return {
    state: interpretPosClockState(shifts, logs),
    shifts,
    logs,
  };
}

export async function posClockIn(
  client: SupabaseClient<Database>,
  shiftId: string,
): Promise<void> {
  await clockShiftWithClient(client, shiftId, "in");
}

export async function posClockOut(
  client: SupabaseClient<Database>,
  shiftId: string,
): Promise<void> {
  await clockShiftWithClient(client, shiftId, "out");
}
