import dayjs, { type Dayjs } from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { formatShiftTime } from "./shiftCalendar";

dayjs.extend(utc);
dayjs.extend(timezone);

/** Same tolerance (minutes) for late clock-in grace and early clock-out classification. */
export const CLOCK_IN_OUT_TOLERANCE_MIN = 10;
export const CLOCK_IN_VERY_LATE_MIN = 30;

export type ClockInUiStatus = "upcoming" | "missing" | "ok" | "late" | "very_late";

export type ClockOutUiStatus =
  | "na"
  | "pending"
  | "upcoming"
  | "missing"
  | "ok"
  | "early";

export function scheduledBoundaryTaipei(shiftDate: string, timeStr: string): Dayjs {
  const hm = formatShiftTime(timeStr);
  return dayjs.tz(`${shiftDate}T${hm}:00`, "Asia/Taipei");
}

export function computeClockInUiStatus(
  shiftDate: string,
  startTime: string,
  clockInAt: string | null,
  todayIso: string,
  nowTaipei: Dayjs,
): ClockInUiStatus {
  const scheduledStart = scheduledBoundaryTaipei(shiftDate, startTime);

  if (!clockInAt) {
    if (shiftDate > todayIso) return "upcoming";
    if (shiftDate < todayIso) return "missing";
    if (nowTaipei.isBefore(scheduledStart)) return "upcoming";
    return "missing";
  }

  const clockIn = dayjs(clockInAt);
  const lateMin = clockIn.diff(scheduledStart, "minute");
  if (lateMin <= CLOCK_IN_OUT_TOLERANCE_MIN) return "ok";
  if (lateMin <= CLOCK_IN_VERY_LATE_MIN) return "late";
  return "very_late";
}

/**
 * `endTime` must be the chain tail end for 連班.
 * @param shiftEndTime - row end time (tail)
 */
export function computeClockOutUiStatus(
  shiftDate: string,
  shiftEndTime: string,
  clockInAt: string | null,
  clockOutAt: string | null,
  todayIso: string,
  nowTaipei: Dayjs,
): ClockOutUiStatus {
  const scheduledEnd = scheduledBoundaryTaipei(shiftDate, shiftEndTime);

  if (!clockInAt) return "na";

  if (!clockOutAt) {
    if (shiftDate > todayIso) return "upcoming";
    if (shiftDate < todayIso) return "missing";
    if (nowTaipei.isAfter(scheduledEnd)) return "missing";
    return "pending";
  }

  const clockOut = dayjs(clockOutAt);
  const endMinusTol = scheduledEnd.subtract(CLOCK_IN_OUT_TOLERANCE_MIN, "minute");
  if (clockOut.isBefore(endMinusTol)) return "early";
  return "ok";
}

/** True if staff should see early clock-out warning before recording 下班. */
export function shouldWarnBeforeClockOut(nowTaipei: Dayjs, shiftDate: string, endTime: string): boolean {
  const scheduledEnd = scheduledBoundaryTaipei(shiftDate, endTime);
  const threshold = scheduledEnd.subtract(CLOCK_IN_OUT_TOLERANCE_MIN, "minute");
  return nowTaipei.isBefore(threshold);
}

/** Whole minutes from `now` until scheduled wall-clock end (for modal copy). */
export function minutesRemainingUntilShiftEnd(
  nowTaipei: Dayjs,
  shiftDate: string,
  endTime: string,
): number {
  const scheduledEnd = scheduledBoundaryTaipei(shiftDate, endTime);
  return Math.max(0, Math.ceil(scheduledEnd.diff(nowTaipei, "minute", true)));
}

export type ClockReportDerived = {
  clockInStatus: ClockInUiStatus;
  clockOutStatus: ClockOutUiStatus;
  lateMinutes: number | null;
};

/** Single punch-row status on the clock log report (上班 / 下班各自一列). */
export type ClockEventUiStatus = "ok" | "late" | "very_late" | "early";

/** 有排班：與 shift.start_time 比對；無排班（臨時）一律正常。 */
export function computeClockInEventStatus(
  hasSchedule: boolean,
  shiftDate: string,
  startTime: string,
  clockInAt: string,
): ClockEventUiStatus {
  if (!hasSchedule) return "ok";
  const scheduledStart = scheduledBoundaryTaipei(shiftDate, startTime);
  const lateMin = dayjs(clockInAt).diff(scheduledStart, "minute");
  if (lateMin <= CLOCK_IN_OUT_TOLERANCE_MIN) return "ok";
  if (lateMin <= CLOCK_IN_VERY_LATE_MIN) return "late";
  return "very_late";
}

/**
 * 有排班：與 chain 下班時間 end_time 比對（end − 10 前打卡＝提早下班）；
 * 無排班（臨時）一律正常。
 */
export function computeClockOutEventStatus(
  hasSchedule: boolean,
  shiftDate: string,
  tailEndTime: string,
  clockOutAt: string,
): ClockEventUiStatus {
  if (!hasSchedule) return "ok";
  const scheduledEnd = scheduledBoundaryTaipei(shiftDate, tailEndTime);
  const threshold = scheduledEnd.subtract(CLOCK_IN_OUT_TOLERANCE_MIN, "minute");
  if (dayjs(clockOutAt).isBefore(threshold)) return "early";
  return "ok";
}

export function computeClockReportDerived(
  row: {
    shift_date: string;
    start_time: string;
    end_time: string;
    clock_in_at: string | null;
    clock_out_at: string | null;
  },
  todayIso: string,
): ClockReportDerived {
  const scheduledStart = scheduledBoundaryTaipei(row.shift_date, row.start_time);
  const scheduledEnd = scheduledBoundaryTaipei(row.shift_date, row.end_time);
  const now = dayjs().tz("Asia/Taipei");

  let clockInStatus: ClockInUiStatus;
  let lateMinutes: number | null = null;

  if (!row.clock_in_at) {
    if (row.shift_date > todayIso) {
      clockInStatus = "upcoming";
    } else if (row.shift_date < todayIso) {
      clockInStatus = "missing";
    } else if (now.isBefore(scheduledStart)) {
      clockInStatus = "upcoming";
    } else if (now.isAfter(scheduledEnd)) {
      clockInStatus = "missing";
    } else {
      clockInStatus = "missing";
    }
  } else {
    const clockIn = dayjs(row.clock_in_at);
    lateMinutes = clockIn.diff(scheduledStart, "minute");
    if (lateMinutes <= CLOCK_IN_OUT_TOLERANCE_MIN) clockInStatus = "ok";
    else if (lateMinutes <= CLOCK_IN_VERY_LATE_MIN) clockInStatus = "late";
    else clockInStatus = "very_late";
  }

  const clockOutStatus = computeClockOutUiStatus(
    row.shift_date,
    row.end_time,
    row.clock_in_at,
    row.clock_out_at,
    todayIso,
    now,
  );

  return { clockInStatus, clockOutStatus, lateMinutes };
}
