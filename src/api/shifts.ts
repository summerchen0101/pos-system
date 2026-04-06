import { supabase } from '../supabase'
import type { ShiftClockLogRow, ShiftRow, ShiftSwapRequestRow } from '../types/supabase'

export type ShiftWithNames = ShiftRow & {
  user_name: string | null
  booth_name: string | null
}

type ShiftSelectRow = ShiftRow & {
  users: { name: string } | { name: string }[] | null
  booths: { name: string } | { name: string }[] | null
}

function mapShiftRow(r: ShiftSelectRow): ShiftWithNames {
  const u = r.users
  const b = r.booths
  const userName = Array.isArray(u) ? u[0]?.name ?? null : u?.name ?? null
  const boothName = Array.isArray(b) ? b[0]?.name ?? null : b?.name ?? null
  return {
    id: r.id,
    user_id: r.user_id,
    booth_id: r.booth_id,
    shift_date: r.shift_date,
    start_time: r.start_time,
    end_time: r.end_time,
    note: r.note,
    created_at: r.created_at,
    user_name: userName,
    booth_name: boothName,
  }
}

export async function listShiftsInRange(
  boothId: string | null,
  fromDate: string,
  toDate: string,
): Promise<ShiftWithNames[]> {
  let q = supabase
    .from('shifts')
    .select('id, user_id, booth_id, shift_date, start_time, end_time, note, created_at, users(name), booths(name)')
    .gte('shift_date', fromDate)
    .lte('shift_date', toDate)
    .order('shift_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (boothId) q = q.eq('booth_id', boothId)

  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as unknown as ShiftSelectRow[]).map(mapShiftRow)
}

export async function listClockLogsForShiftIds(shiftIds: string[]): Promise<ShiftClockLogRow[]> {
  if (shiftIds.length === 0) return []
  const { data, error } = await supabase
    .from('shift_clock_logs')
    .select('id, shift_id, user_id, clock_in_at, clock_out_at')
    .in('shift_id', shiftIds)
  if (error) throw error
  return (data ?? []) as ShiftClockLogRow[]
}

export type ShiftUpsertInput = {
  user_id: string
  booth_id: string
  shift_date: string
  start_time: string
  end_time: string
  note?: string | null
}

export async function createShiftAdmin(input: ShiftUpsertInput): Promise<ShiftRow> {
  const { data, error } = await supabase
    .from('shifts')
    .insert({
      user_id: input.user_id,
      booth_id: input.booth_id,
      shift_date: input.shift_date,
      start_time: input.start_time,
      end_time: input.end_time,
      note: input.note?.trim() ? input.note.trim() : null,
    })
    .select('id, user_id, booth_id, shift_date, start_time, end_time, note, created_at')
    .single()
  if (error) throw error
  return data as ShiftRow
}

export async function updateShiftAdmin(id: string, input: Partial<ShiftUpsertInput>): Promise<ShiftRow> {
  const row: Record<string, unknown> = {}
  if (input.user_id !== undefined) row.user_id = input.user_id
  if (input.booth_id !== undefined) row.booth_id = input.booth_id
  if (input.shift_date !== undefined) row.shift_date = input.shift_date
  if (input.start_time !== undefined) row.start_time = input.start_time
  if (input.end_time !== undefined) row.end_time = input.end_time
  if (input.note !== undefined) row.note = input.note?.trim() ? input.note.trim() : null

  const { data, error } = await supabase
    .from('shifts')
    .update(row)
    .eq('id', id)
    .select('id, user_id, booth_id, shift_date, start_time, end_time, note, created_at')
    .single()
  if (error) throw error
  return data as ShiftRow
}

export async function deleteShiftAdmin(id: string): Promise<void> {
  const { error } = await supabase.from('shifts').delete().eq('id', id)
  if (error) throw error
}

export async function listColleagueShiftsForSwap(
  boothId: string,
  fromDate: string,
  toDate: string,
): Promise<ShiftRow[]> {
  const { data, error } = await supabase.rpc('list_colleague_shifts_for_swap', {
    p_booth_id: boothId,
    p_from: fromDate,
    p_to: toDate,
  })
  if (error) throw error
  return (data ?? []) as ShiftRow[]
}

export async function createShiftSwapRequest(
  requesterShiftId: string,
  targetShiftId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_shift_swap_request', {
    p_requester_shift_id: requesterShiftId,
    p_target_shift_id: targetShiftId,
  })
  if (error) throw error
  return data as string
}

export async function shiftSwapTargetRespond(requestId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('shift_swap_target_respond', {
    p_request_id: requestId,
    p_accept: accept,
  })
  if (error) throw error
}

export async function cancelShiftSwapRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_shift_swap_request', {
    p_request_id: requestId,
  })
  if (error) throw error
}

export async function adminApproveShiftSwap(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_approve_shift_swap', {
    p_request_id: requestId,
  })
  if (error) throw error
}

export async function adminRejectShiftSwap(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_reject_shift_swap', {
    p_request_id: requestId,
  })
  if (error) throw error
}

export async function clockShift(shiftId: string, action: 'in' | 'out'): Promise<void> {
  const { error } = await supabase.rpc('clock_shift', {
    p_shift_id: shiftId,
    p_action: action,
  })
  if (error) throw error
}

export type SwapRequestListEntry = ShiftSwapRequestRow & {
  requester_name: string | null
  target_name: string | null
}

type SwapSelectRow = ShiftSwapRequestRow & {
  requester: { name: string } | { name: string }[] | null
  target: { name: string } | { name: string }[] | null
}

function mapSwapRow(r: SwapSelectRow): SwapRequestListEntry {
  const rq = r.requester
  const tg = r.target
  const requesterName = Array.isArray(rq) ? rq[0]?.name ?? null : rq?.name ?? null
  const targetName = Array.isArray(tg) ? tg[0]?.name ?? null : tg?.name ?? null
  return {
    ...r,
    requester_name: requesterName,
    target_name: targetName,
  }
}

/** Admin / participant: load swap requests relevant to open swaps UI */
export async function listSwapRequestsForAdmin(): Promise<SwapRequestListEntry[]> {
  const { data, error } = await supabase
    .from('shift_swap_requests')
    .select(
      'id, requester_id, target_id, requester_shift_id, target_shift_id, status, created_at, requester:users!shift_swap_requests_requester_id_fkey(name), target:users!shift_swap_requests_target_id_fkey(name)',
    )
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false })

  if (error) throw error
  return ((data ?? []) as unknown as SwapSelectRow[]).map(mapSwapRow)
}

export async function listSwapRequestsForUser(userId: string): Promise<SwapRequestListEntry[]> {
  const { data, error } = await supabase
    .from('shift_swap_requests')
    .select(
      'id, requester_id, target_id, requester_shift_id, target_shift_id, status, created_at, requester:users!shift_swap_requests_requester_id_fkey(name), target:users!shift_swap_requests_target_id_fkey(name)',
    )
    .or(`requester_id.eq.${userId},target_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(80)

  if (error) throw error
  return ((data ?? []) as unknown as SwapSelectRow[]).map(mapSwapRow)
}

/** Shifts by ids (admin or own via RLS) */
export async function getShiftsByIds(ids: string[]): Promise<ShiftWithNames[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('shifts')
    .select('id, user_id, booth_id, shift_date, start_time, end_time, note, created_at, users(name), booths(name)')
    .in('id', ids)
  if (error) throw error
  return ((data ?? []) as unknown as ShiftSelectRow[]).map(mapShiftRow)
}

export function buildShiftsClockCsv(
  shifts: ShiftWithNames[],
  logs: ShiftClockLogRow[],
  boothNameById: Map<string, string>,
): string {
  const logByShift = new Map(logs.map((l) => [l.shift_id, l]))
  const headers = [
    'shift_id',
    'shift_date',
    'start_time',
    'end_time',
    'booth_id',
    'booth_name',
    'user_id',
    'user_name',
    'note',
    'clock_in_at',
    'clock_out_at',
  ]
  const esc = (v: string | null | undefined) => {
    if (v == null) return ''
    const s = String(v)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.join(',')]
  for (const s of shifts) {
    const l = logByShift.get(s.id)
    lines.push(
      [
        esc(s.id),
        esc(s.shift_date),
        esc(s.start_time),
        esc(s.end_time),
        esc(s.booth_id),
        esc(s.booth_name ?? boothNameById.get(s.booth_id) ?? ''),
        esc(s.user_id),
        esc(s.user_name),
        esc(s.note),
        esc(l?.clock_in_at ?? ''),
        esc(l?.clock_out_at ?? ''),
      ].join(','),
    )
  }
  return lines.join('\n')
}
