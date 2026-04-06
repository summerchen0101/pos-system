import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

export function weekRangeIso(anchor: Dayjs): {
  start: string;
  end: string;
  days: Dayjs[];
} {
  const startD = anchor.startOf("isoWeek");
  const days: Dayjs[] = [];
  for (let i = 0; i < 7; i += 1) {
    days.push(startD.add(i, "day"));
  }
  return {
    start: startD.format("YYYY-MM-DD"),
    end: startD.add(6, "day").format("YYYY-MM-DD"),
    days,
  };
}

export function formatShiftTime(t: string): string {
  if (t.length >= 5) return t.slice(0, 5);
  return t;
}

/** Server uses Asia/Taipei for clock windows; keep client aligned. */
export function canClockInTaipei(
  shift: { shift_date: string; start_time: string },
  now: Dayjs = dayjs(),
): boolean {
  const hm = formatShiftTime(shift.start_time);
  const start = dayjs.tz(`${shift.shift_date}T${hm}:00`, "Asia/Taipei");
  const localDay = now.tz("Asia/Taipei").format("YYYY-MM-DD");
  if (localDay !== shift.shift_date) return false;
  const diffMin = now.diff(start, "minute", true);
  return diffMin >= -30 && diffMin <= 30;
}

export function canClockOutTaipei(
  shift: { shift_date: string; end_time: string },
  now: Dayjs = dayjs(),
): boolean {
  const hm = formatShiftTime(shift.end_time);
  const end = dayjs.tz(`${shift.shift_date}T${hm}:00`, "Asia/Taipei");
  const localDay = now.tz("Asia/Taipei").format("YYYY-MM-DD");
  if (localDay !== shift.shift_date) return false;
  const diffMin = now.diff(end, "minute", true);
  return diffMin >= -30 && diffMin <= 30;
}
