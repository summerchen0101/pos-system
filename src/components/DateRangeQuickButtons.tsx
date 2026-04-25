import { Button, Space } from "antd";
import type { Dayjs } from "dayjs";
import { zhtw } from "../locales/zhTW";
import {
  datePresetRange,
  type DateRangePresetId,
} from "../lib/dateRangePresets";

const c = zhtw.common;

const PRESETS: { id: DateRangePresetId; label: string }[] = [
  { id: "yesterday", label: c.dateQuickYesterday },
  { id: "today", label: c.dateQuickToday },
  { id: "thisIsoWeek", label: c.dateQuickThisWeek },
  { id: "lastIsoWeek", label: c.dateQuickLastWeek },
  { id: "thisMonth", label: c.dateQuickThisMonth },
  { id: "lastMonth", label: c.dateQuickLastMonth },
];

type Props = {
  onChange: (range: [Dayjs, Dayjs]) => void;
};

export function DateRangeQuickButtons({ onChange }: Props) {
  return (
    <Space size={[4, 8]} wrap>
      {PRESETS.map(({ id, label }) => (
        <Button
          key={id}
          size="small"
          onClick={() => onChange(datePresetRange(id))}
        >
          {label}
        </Button>
      ))}
    </Space>
  );
}
