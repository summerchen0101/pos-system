import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(isoWeek);

export type DateRangePresetId =
  | "yesterday"
  | "today"
  | "thisIsoWeek"
  | "lastIsoWeek"
  | "thisMonth"
  | "lastMonth";

/** Anchor defaults to "now" in local time, matching RangePicker. */
export function datePresetRange(
  preset: DateRangePresetId,
  anchor: Dayjs = dayjs(),
): [Dayjs, Dayjs] {
  switch (preset) {
    case "yesterday": {
      const d = anchor.subtract(1, "day");
      return [d, d];
    }
    case "today":
      return [anchor, anchor];
    case "thisIsoWeek": {
      const s = anchor.startOf("isoWeek");
      return [s, s.endOf("isoWeek")];
    }
    case "lastIsoWeek": {
      const start = anchor.startOf("isoWeek").subtract(1, "week");
      return [start, start.endOf("isoWeek")];
    }
    case "thisMonth": {
      const s = anchor.startOf("month");
      return [s, s.endOf("month")];
    }
    case "lastMonth": {
      const m = anchor.subtract(1, "month");
      return [m.startOf("month"), m.endOf("month")];
    }
  }
}
