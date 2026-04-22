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

export function monthRangeIso(anchor: Dayjs): {
  start: string;
  end: string;
  days: Dayjs[];
} {
  const startD = anchor.startOf("month");
  const n = startD.daysInMonth();
  const days: Dayjs[] = [];
  for (let i = 0; i < n; i += 1) {
    days.push(startD.add(i, "day"));
  }
  const endD = startD.add(n - 1, "day");
  return {
    start: startD.format("YYYY-MM-DD"),
    end: endD.format("YYYY-MM-DD"),
    days,
  };
}

export function formatShiftTime(t: string): string {
  if (t.length >= 5) return t.slice(0, 5);
  return t;
}

/** True when wall-clock date in Asia/Taipei matches the shift's calendar date (no time-of-day restriction). */
export function canClockOnShiftDayTaipei(
  shift: { shift_date: string },
  now: Dayjs = dayjs(),
): boolean {
  const localDay = now.tz("Asia/Taipei").format("YYYY-MM-DD");
  return localDay === shift.shift_date;
}
