import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { supabase } from '../supabase'
import { formatShiftTime } from '../lib/shiftCalendar'
import { buildConsecutiveChains } from '../lib/shiftConsecutive'
import { computeClockReportDerived, type ClockInUiStatus, type ClockOutUiStatus } from '../lib/clockStatus'

export type { ClockInUiStatus, ClockOutUiStatus } from '../lib/clockStatus'
import type { ShiftWithNames } from './shifts'
import type { ShiftClockLogRow, ShiftRow } from '../types/supabase'

dayjs.extend(utc)
dayjs.extend(timezone)

export type ClockLogReportRow = {
  /** Earliest segment id in a consecutive chain (where clock log is stored). */
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
  clockInStatus: ClockInUiStatus
  clockOutStatus: ClockOutUiStatus
  lateMinutes: number | null
  /** True when this row merges two+ touching segments for display. */
  isMergedChain?: boolean
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

  const byKey = new Map<string, ShiftSelectRow[]>()
  for (const raw of rawShifts) {
    const k = `${raw.user_id}|${raw.booth_id}|${raw.shift_date}`
    const arr = byKey.get(k) ?? []
    arr.push(raw)
    byKey.set(k, arr)
  }

  for (const arr of byKey.values()) {
    arr.sort((a, b) => a.start_time.localeCompare(b.start_time))
    const chains = buildConsecutiveChains(arr as unknown as ShiftWithNames[])
    for (const chain of chains) {
      const head = chain[0] as unknown as ShiftSelectRow
      const tail = chain[chain.length - 1] as unknown as ShiftSelectRow
      const u = head.users
      const b = head.booths
      const userName = Array.isArray(u) ? u[0]?.name ?? null : u?.name ?? null
      const boothName = Array.isArray(b) ? b[0]?.name ?? null : b?.name ?? null
      const log = logByShift.get(head.id)

      const base = {
        shift_id: head.id,
        user_id: head.user_id,
        booth_id: head.booth_id,
        shift_date: head.shift_date,
        start_time: head.start_time,
        end_time: tail.end_time,
        user_name: userName,
        booth_name: boothName,
        clock_in_at: log?.clock_in_at ?? null,
        clock_out_at: log?.clock_out_at ?? null,
      }
      const { clockInStatus, clockOutStatus, lateMinutes } = computeClockReportDerived(base, todayIso)
      rows.push({
        ...base,
        clockInStatus,
        clockOutStatus,
        lateMinutes,
        isMergedChain: chain.length > 1,
      })
    }
  }

  rows.sort((a, b) => {
    if (a.shift_date !== b.shift_date) return a.shift_date > b.shift_date ? -1 : 1
    return a.start_time.localeCompare(b.start_time)
  })

  return rows
}

export type ClockSummaryToday = {
  /** Distinct users who clocked in today (any shift). */
  presentUserIds: number
  /** Distinct users with 遲到 or 嚴重遲到 today. */
  lateUserIds: number
  /** Shifts scheduled today with no clock-in and date <= today. */
  missingShiftCount: number
  /** Distinct users who clocked out early today (before end − 10 min). */
  earlyClockOutUserIds: number
}

export function summarizeTodayRows(
  rows: ClockLogReportRow[],
  todayIso: string,
): ClockSummaryToday {
  const todayRows = rows.filter((r) => r.shift_date === todayIso)
  const present = new Set<string>()
  const late = new Set<string>()
  const earlyOut = new Set<string>()
  let missingShiftCount = 0

  for (const r of todayRows) {
    if (r.clock_in_at) {
      present.add(r.user_id)
      if (r.clockInStatus === 'late' || r.clockInStatus === 'very_late') {
        late.add(r.user_id)
      }
    } else if (r.clockInStatus === 'missing') {
      missingShiftCount += 1
    }
    if (r.clockOutStatus === 'early') {
      earlyOut.add(r.user_id)
    }
  }

  return {
    presentUserIds: present.size,
    lateUserIds: late.size,
    missingShiftCount,
    earlyClockOutUserIds: earlyOut.size,
  }
}
