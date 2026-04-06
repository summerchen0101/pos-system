import { formatShiftTime } from "./shiftCalendar";
import type { ShiftWithNames } from "../api/shifts";

/** Compare scheduled wall times (handles HH:mm vs HH:mm:ss from DB). */
export function sameShiftInstant(a: string, b: string): boolean {
  return formatShiftTime(a) === formatShiftTime(b);
}

/**
 * Build maximal consecutive chains: same user, booth, calendar date, and each segment's
 * `end_time` equals the next segment's `start_time`. `shifts` must be pre-sorted by `start_time`.
 */
export function buildConsecutiveChains(shifts: ShiftWithNames[]): ShiftWithNames[][] {
  if (shifts.length === 0) return [];
  const chains: ShiftWithNames[][] = [];
  let cur: ShiftWithNames[] = [shifts[0]!];
  for (let i = 1; i < shifts.length; i++) {
    const prev = cur[cur.length - 1]!;
    const next = shifts[i]!;
    const touches =
      prev.user_id === next.user_id &&
      prev.booth_id === next.booth_id &&
      prev.shift_date === next.shift_date &&
      sameShiftInstant(prev.end_time, next.start_time);
    if (touches) {
      cur.push(next);
    } else {
      chains.push(cur);
      cur = [next];
    }
  }
  chains.push(cur);
  return chains;
}

export type ConsecutiveShiftMeta = {
  headId: string;
  tail: ShiftWithNames;
  /** Index in chain: 0 = head */
  indexInChain: number;
  chainLength: number;
};

/** Map shift id → chain metadata for one day's shifts (mixed users/booths). */
export function consecutiveMetaByShiftId(shifts: ShiftWithNames[]): Map<string, ConsecutiveShiftMeta> {
  const byKey = new Map<string, ShiftWithNames[]>();
  for (const s of shifts) {
    const k = `${s.user_id}|${s.booth_id}|${s.shift_date}`;
    const arr = byKey.get(k) ?? [];
    arr.push(s);
    byKey.set(k, arr);
  }
  const meta = new Map<string, ConsecutiveShiftMeta>();
  for (const arr of byKey.values()) {
    arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
    const chains = buildConsecutiveChains(arr);
    for (const chain of chains) {
      const head = chain[0]!;
      const tail = chain[chain.length - 1]!;
      chain.forEach((sh, i) => {
        meta.set(sh.id, {
          headId: head.id,
          tail,
          indexInChain: i,
          chainLength: chain.length,
        });
      });
    }
  }
  return meta;
}

/** Log row used for a shift segment, accounting for clock rows stored on consecutive head only. */
export function logForShiftSegment<T extends { clock_in_at: string | null; clock_out_at: string | null }>(
  shiftId: string,
  meta: Map<string, ConsecutiveShiftMeta>,
  logByShift: Map<string, T>,
): T | undefined {
  const m = meta.get(shiftId);
  const lookupId = m?.headId ?? shiftId;
  return logByShift.get(lookupId);
}
