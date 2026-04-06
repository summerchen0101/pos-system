import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { supabase } from '../supabase'
import { formatShiftTime } from '../lib/shiftCalendar'
import type { ShiftClockLogRow, ShiftRow } from '../types/supabase'

dayjs.extend(utc)
dayjs.extend(timezone)

export type ClockReportStatus =
  | 'ok'
  | 'late'
  | 'very_late'
  | 'missing'
  /** Shift day after today, no clock-in yet */
  | 'upcoming'

export type ClockLogReportRow = {
  shift_id: string
  user_id: string
  booth_id: string
  shift_date: string
  start_time: string
  end_time: string
  user_name: string | null
  booth_name: string | null
  clock_in_at: string | null
  clock_out_at: string | null
  status: ClockReportStatus
  lateMinutes: number | null
}

/** 早班 / 晚班: start before 14:00 Taipei wall time → 早班 */
export function shiftKindLabel(startTime: string, earlyLabel: string, lateLabel: string): string {
  const hm = formatShiftTime(startTime)
  const h = Number(hm.slice(0, 2))
  const m = Number(hm.slice(3, 5))
  const minutes = h * 60 + m
  return minutes < 14 * 60 ? earlyLabel : lateLabel
}

export function taipeiTodayIso(): string {
  return dayjs().tz('Asia/Taipei').format('YYYY-MM-DD')
}

function scheduledStartTaipei(shiftDate: string, startTime: string): dayjs.Dayjs {
  const hm = formatShiftTime(startTime)
  return dayjs.tz(`${shiftDate}T${hm}:00`, 'Asia/Taipei')
}

/**
 * @param todayIso — calendar "today" in Asia/Taipei (YYYY-MM-DD)
 */
export function computeClockReportStatus(
  row: Omit<ClockLogReportRow, 'status' | 'lateMinutes'>,
  todayIso: string,
): Pick<ClockLogReportRow, 'status' | 'lateMinutes'> {
  const scheduled = scheduledStartTaipei(row.shift_date, row.start_time)

  if (!row.clock_in_at) {
    if (row.shift_date <= todayIso) {
      return { status: 'missing', lateMinutes: null }
    }
    return { status: 'upcoming', lateMinutes: null }
  }

  const clockIn = dayjs(row.clock_in_at)
  const lateMinutes = clockIn.diff(scheduled, 'minute')
  if (lateMinutes <= 10) {
    return { status: 'ok', lateMinutes }
  }
  if (lateMinutes <= 30) {
    return { status: 'late', lateMinutes }
  }
  return { status: 'very_late', lateMinutes }
}

type ShiftSelectRow = ShiftRow & {
  users: { name: string } | { name: string }[] | null
  booths: { name: string } | { name: string }[] | null
}

export type ListClockLogReportOptions = {
  fromDate: string
  toDate: string
  boothId?: string | null
  userId?: string | null
}

export async function listClockLogReportRows(
  opts: ListClockLogReportOptions,
): Promise<ClockLogReportRow[]> {
  let q = supabase
    .from('shifts')
    .select('id, user_id, booth_id, shift_date, start_time, end_time, users(name), booths(name)')
    .gte('shift_date', opts.fromDate)
    .lte('shift_date', opts.toDate)
    .order('shift_date', { ascending: false })
    .order('start_time', { ascending: true })

  if (opts.boothId) q = q.eq('booth_id', opts.boothId)
  if (opts.userId) q = q.eq('user_id', opts.userId)

  const { data, error } = await q
  if (error) throw error

  const rawShifts = (data ?? []) as unknown as ShiftSelectRow[]
  const shiftIds = rawShifts.map((s) => s.id)

  let logs: ShiftClockLogRow[] = []
  if (shiftIds.length > 0) {
    const { data: logRows, error: le } = await supabase
      .from('shift_clock_logs')
      .select('shift_id, clock_in_at, clock_out_at')
      .in('shift_id', shiftIds)
    if (le) throw le
    logs = (logRows ?? []) as ShiftClockLogRow[]
  }

  const logByShift = new Map(logs.map((l) => [l.shift_id, l]))
  const todayIso = taipeiTodayIso()
  const rows: ClockLogReportRow[] = []

  for (const raw of rawShifts) {
    const u = raw.users
    const b = raw.booths
    const userName = Array.isArray(u) ? u[0]?.name ?? null : u?.name ?? null
    const boothName = Array.isArray(b) ? b[0]?.name ?? null : b?.name ?? null
    const log = logByShift.get(raw.id)

    const base: Omit<ClockLogReportRow, 'status' | 'lateMinutes'> = {
      shift_id: raw.id,
      user_id: raw.user_id,
      booth_id: raw.booth_id,
      shift_date: raw.shift_date,
      start_time: raw.start_time,
      end_time: raw.end_time,
      user_name: userName,
      booth_name: boothName,
      clock_in_at: log?.clock_in_at ?? null,
      clock_out_at: log?.clock_out_at ?? null,
    }
    const { status, lateMinutes } = computeClockReportStatus(base, todayIso)
    rows.push({ ...base, status, lateMinutes })
  }

  return rows
}

export type ClockSummaryToday = {
  /** Distinct users who clocked in today (any shift). */
  presentUserIds: number
  /** Distinct users with 遲到 or 嚴重遲到 today. */
  lateUserIds: number
  /** Shifts scheduled today with no clock-in and date <= today. */
  missingShiftCount: number
}

export function summarizeTodayRows(
  rows: ClockLogReportRow[],
  todayIso: string,
): ClockSummaryToday {
  const todayRows = rows.filter((r) => r.shift_date === todayIso)
  const present = new Set<string>()
  const late = new Set<string>()
  let missingShiftCount = 0

  for (const r of todayRows) {
    if (r.clock_in_at) {
      present.add(r.user_id)
      if (r.status === 'late' || r.status === 'very_late') {
        late.add(r.user_id)
      }
    } else if (r.status === 'missing') {
      missingShiftCount += 1
    }
  }

  return {
    presentUserIds: present.size,
    lateUserIds: late.size,
    missingShiftCount,
  }
}
