import { App, Button, Drawer, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useCallback, useEffect, useState } from "react";
import {
  deleteOrderRestoreInventoryPos,
  fetchPosOrdersForBoothDay,
  type PosOrderLineJson,
  type PosOrderSummaryJson,
} from "../../api/posOrdersApi";
import { formatMoney } from "../../lib/money";
import { OrderGiftTag } from "../OrderGiftTag";
import { zhtw } from "../../locales/zhTW";
import { palette } from "../../theme/palette";

dayjs.extend(utc);
dayjs.extend(timezone);

const p = zhtw.pos.todayOrders;
const oOrd = zhtw.admin.orders;

function buildPreview(items: PosOrderLineJson[], maxFirst = 3): string {
  if (items.length === 0) return zhtw.common.dash;
  const parts = items.slice(0, maxFirst).map((r) => `${r.product_name}×${r.quantity}`);
  const suffix = items.length > maxFirst ? "…" : "";
  return `${parts.join("、")}${suffix}`;
}

function lineTag(source: string | null, isGift: boolean) {
  if (source === "FREE_SELECTION")
    return <Tag color="purple">{oOrd.tagFreeSelection}</Tag>;
  if (source === "BUNDLE_COMPONENT")
    return <Tag color={palette.tagBundle}>{oOrd.tagBundleComponent}</Tag>;
  if (isGift) return <OrderGiftTag label={oOrd.tagGift} />;
  return null;
}

type Props = {
  boothId: string;
  open: boolean;
  onClose: () => void;
};

export function PosTodayOrdersDrawer({ boothId, open, onClose }: Props) {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PosOrderSummaryJson[]>([]);

  const load = useCallback(async () => {
    if (!boothId) return;
    setLoading(true);
    try {
      const list = await fetchPosOrdersForBoothDay(boothId, null);
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : p.loadError);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [boothId, message]);

  useEffect(() => {
    if (open && boothId) void load();
  }, [open, boothId, load]);

  const onDelete = (order: PosOrderSummaryJson) => {
    modal.confirm({
      title: p.deleteConfirmTitle,
      content: p.deleteConfirmBody,
      okText: p.deleteOk,
      okButtonProps: { danger: true },
      cancelText: zhtw.common.cancel,
      onOk: async () => {
        try {
          await deleteOrderRestoreInventoryPos(order.id, boothId);
          message.success(p.deleteSuccess);
          await load();
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (msg.includes("order_not_today") || msg.includes("order_not_found")) {
            message.error(p.deleteNotAllowed);
          } else if (msg.includes("booth_mismatch")) {
            message.error(p.deleteBoothMismatch);
          } else {
            message.error(msg || p.deleteError);
          }
        }
      },
    });
  };

  const lineColumns: ColumnsType<PosOrderLineJson> = [
    {
      title: p.colProduct,
      key: "n",
      render: (_, r) => (
        <Space size={4} wrap>
          <span>{r.product_name}</span>
          {lineTag(r.source, r.is_gift)}
        </Space>
      ),
    },
    {
      title: p.colSize,
      dataIndex: "size",
      key: "s",
      width: 80,
      render: (s: string | null) => s?.trim() || "—",
    },
    {
      title: p.colQty,
      dataIndex: "quantity",
      key: "q",
      width: 56,
      align: "right",
    },
    {
      title: p.colUnitPrice,
      dataIndex: "unit_price_cents",
      key: "u",
      width: 96,
      align: "right",
      render: (c: number) => formatMoney(c),
    },
    {
      title: p.colLineTotal,
      dataIndex: "line_total_cents",
      key: "t",
      width: 96,
      align: "right",
      render: (c: number) => formatMoney(c),
    },
  ];

  const columns: ColumnsType<PosOrderSummaryJson> = [
    {
      title: p.colTime,
      key: "time",
      width: 72,
      render: (_, r) => dayjs(r.created_at).tz("Asia/Taipei").format("HH:mm"),
    },
    {
      title: p.colSummary,
      key: "sum",
      ellipsis: true,
      render: (_, r) => buildPreview(r.items ?? []),
    },
    {
      title: p.colFinal,
      key: "fin",
      width: 100,
      align: "right",
      render: (_, r) => formatMoney(r.final_amount),
    },
    {
      title: p.colActions,
      key: "a",
      width: 88,
      render: (_, r) => (
        <Button type="link" size="small" danger onClick={() => onDelete(r)} style={{ padding: 0 }}>
          {zhtw.common.delete}
        </Button>
      ),
    },
  ];

  return (
    <Drawer
      title={p.drawerTitle}
      placement="right"
      width={Math.min(720, typeof window !== "undefined" ? window.innerWidth - 24 : 720)}
      open={open}
      onClose={onClose}
      destroyOnClose>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
        {p.drawerHint}
      </Typography.Text>
      <Button type="default" size="small" onClick={() => void load()} style={{ marginBottom: 12 }}>
        {p.refresh}
      </Button>
      <Table<PosOrderSummaryJson>
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
        columns={columns}
        dataSource={rows}
        locale={{ emptyText: p.empty }}
        expandable={{
          expandedRowRender: (record) => (
            <Table<PosOrderLineJson>
              rowKey="id"
              size="small"
              pagination={false}
              columns={lineColumns}
              dataSource={record.items ?? []}
            />
          ),
        }}
      />
    </Drawer>
  );
}
