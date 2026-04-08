import { Tag } from "antd";
import { palette } from "../theme/palette";

/** 贈品列標籤：暗色表格上避免 Ant `Tag color={hex}` 算出低對比。 */
export function OrderGiftTag({ label }: { label: string }) {
  return (
    <Tag
      bordered={false}
      style={{
        color: palette.accentOnAccent,
        background: palette.accent,
        border: `1px solid ${palette.accentActive}`,
      }}>
      {label}
    </Tag>
  );
}
