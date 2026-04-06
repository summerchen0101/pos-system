import type { SupabaseClient } from '@supabase/supabase-js'
import {
  clockShiftWithClient,
  listClockLogsForShiftIds,
  listClockLogsForShiftIdsWithClient,
  listShiftsInRange,
  listShiftsInRangeWithClient,
  type ShiftWithNames,
} from '../api/shifts'
import { taipeiTodayIso } from '../api/clockLogsReport'
import type { Database } from '../types/supabase'
import type { ShiftClockLogRow } from '../types/supabase'

export type PosClockState =
  | { kind: 'no_shift' }
  | { kind: 'done'; lastClockOutAt: string }
  | { kind: 'clock_in'; shift: ShiftWithNames }
  | { kind: 'clock_out'; shift: ShiftWithNames; log: ShiftClockLogRow }

export function interpretPosClockState(
  shifts: ShiftWithNames[],
  logs: ShiftClockLogRow[],
): PosClockState {
  if (shifts.length === 0) return { kind: 'no_shift' }
  const sorted = [...shifts].sort((a, b) => a.start_time.localeCompare(b.start_time))
  const logByShift = new Map(logs.map((l) => [l.shift_id, l]))
  for (const sh of sorted) {
    const log = logByShift.get(sh.id)
    if (!log?.clock_in_at) {
      return { kind: 'clock_in', shift: sh }
    }
    if (!log.clock_out_at) {
      return { kind: 'clock_out', shift: sh, log }
    }
  }
  const last = sorted[sorted.length - 1]
  const lastLog = logByShift.get(last.id)!
  return { kind: 'done', lastClockOutAt: lastLog.clock_out_at! }
}

export async function loadPosClockState(
  boothId: string,
  userId: string,
  dateIso: string = taipeiTodayIso(),
): Promise<{ state: PosClockState; shifts: ShiftWithNames[]; logs: ShiftClockLogRow[] }> {
  const shifts = await listShiftsInRange(boothId, dateIso, dateIso, { userId })
  const logs = await listClockLogsForShiftIds(shifts.map((s) => s.id))
  return {
    state: interpretPosClockState(shifts, logs),
    shifts,
    logs,
  }
}

export async function loadPosClockStateWithClient(
  client: SupabaseClient<Database>,
  boothId: string,
  userId: string,
  dateIso: string = taipeiTodayIso(),
): Promise<{ state: PosClockState; shifts: ShiftWithNames[]; logs: ShiftClockLogRow[] }> {
  const shifts = await listShiftsInRangeWithClient(client, boothId, dateIso, dateIso, { userId })
  const logs = await listClockLogsForShiftIdsWithClient(client, shifts.map((s) => s.id))
  return {
    state: interpretPosClockState(shifts, logs),
    shifts,
    logs,
  }
}

export async function posClockIn(
  client: SupabaseClient<Database>,
  shiftId: string,
): Promise<void> {
  await clockShiftWithClient(client, shiftId, 'in')
}

export async function posClockOut(
  client: SupabaseClient<Database>,
  shiftId: string,
): Promise<void> {
  await clockShiftWithClient(client, shiftId, 'out')
}
