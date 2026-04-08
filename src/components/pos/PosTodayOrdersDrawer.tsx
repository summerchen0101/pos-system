import { App, Button, Drawer, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useCallback, useEffect, useState } from "react";
import { updateOrderBuyerProfile } from "../../api/ordersApi";
import {
  deleteOrderRestoreInventoryPos,
  fetchPosOrdersForBoothDay,
  type PosOrderLineJson,
  type PosOrderSummaryJson,
} from "../../api/posOrdersApi";
import { formatMoney } from "../../lib/money";
import type { BuyerAgeGroup, BuyerGender, BuyerMotivation } from "../../types/order";
import { OrderGiftTag } from "../OrderGiftTag";
import { BuyerProfileModal } from "./BuyerProfileModal";
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

function genderShort(v: BuyerGender | null): string {
  if (v === "male") return oOrd.buyerGenderMale;
  if (v === "female") return oOrd.buyerGenderFemale;
  if (v === "other") return oOrd.buyerGenderOther;
  return "";
}

function ageShort(v: BuyerAgeGroup | null): string {
  if (v === "under_18") return oOrd.buyerAgeUnder18;
  if (v === "18_24") return oOrd.buyerAge18to24;
  if (v === "25_34") return oOrd.buyerAge25to34;
  if (v === "35_44") return oOrd.buyerAge35to44;
  if (v === "45_54") return oOrd.buyerAge45to54;
  if (v === "55_above") return oOrd.buyerAge55Above;
  return "";
}

function motivationShort(v: BuyerMotivation | null): string {
  if (v === "self_use") return oOrd.buyerMotivationSelfUse;
  if (v === "gift") return oOrd.buyerMotivationGift;
  if (v === "trial") return oOrd.buyerMotivationTrial;
  if (v === "repurchase") return oOrd.buyerMotivationRepurchase;
  if (v === "other") return oOrd.buyerMotivationOther;
  return "";
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PosOrderSummaryJson | null>(null);

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

  const openProfileEditor = (order: PosOrderSummaryJson) => {
    setEditingOrder(order);
    setProfileOpen(true);
  };

  const summaryProfile = (order: PosOrderSummaryJson): string => {
    const parts = [
      genderShort(order.buyer_gender),
      ageShort(order.buyer_age_group),
      motivationShort(order.buyer_motivation),
    ].filter((x) => x.length > 0);
    return parts.join(" · ");
  };

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
      title: p.colBuyerProfile,
      key: "bp",
      width: 188,
      render: (_, r) => {
        const hasProfile = Boolean(r.buyer_gender || r.buyer_age_group || r.buyer_motivation);
        const summary = summaryProfile(r);
        if (!hasProfile) {
          return (
            <Button
              className="pos-today-orders__fill-profile-btn"
              size="small"
              type="default"
              onClick={() => openProfileEditor(r)}
              style={{ whiteSpace: "nowrap" }}
            >
              {zhtw.common.new}
            </Button>
          );
        }
        return (
          <button
            type="button"
            className="pos-today-orders__profile-summary"
            onClick={() => openProfileEditor(r)}
          >
            {summary}
          </button>
        );
      },
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

  const onSubmitProfile = (patch: {
    buyerGender: BuyerGender | null;
    buyerAgeGroup: BuyerAgeGroup | null;
    buyerMotivation: BuyerMotivation | null;
  }) => {
    if (!editingOrder) return;
    setProfileSaving(true);
    void (async () => {
      try {
        await updateOrderBuyerProfile(editingOrder.id, patch);
        setRows((prev) =>
          prev.map((r) =>
            r.id === editingOrder.id
              ? {
                  ...r,
                  buyer_gender: patch.buyerGender,
                  buyer_age_group: patch.buyerAgeGroup,
                  buyer_motivation: patch.buyerMotivation,
                }
              : r,
          ),
        );
        message.success(p.buyerProfileSaved);
        setProfileOpen(false);
        setEditingOrder(null);
      } catch (e) {
        message.error(e instanceof Error ? e.message : p.buyerProfileSaveError);
      } finally {
        setProfileSaving(false);
      }
    })();
  };

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
        className="pos-today-orders-table"
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
        columns={columns}
        dataSource={rows}
        expandRowByClick={false}
        locale={{ emptyText: p.empty }}
        expandable={{
          expandedRowRender: (record) => (
            <Table<PosOrderLineJson>
              className="pos-today-orders-table__inner"
              rowKey="id"
              size="small"
              pagination={false}
              columns={lineColumns}
              dataSource={record.items ?? []}
            />
          ),
        }}
      />
      <BuyerProfileModal
        open={profileOpen}
        loading={profileSaving}
        initialValues={
          editingOrder
            ? {
                buyerGender: editingOrder.buyer_gender,
                buyerAgeGroup: editingOrder.buyer_age_group,
                buyerMotivation: editingOrder.buyer_motivation,
              }
            : undefined
        }
        defaultValues={{
          buyerGender: "female",
          buyerAgeGroup: "35_44",
          buyerMotivation: "self_use",
        }}
        onSkip={() => {
          setProfileOpen(false);
          setEditingOrder(null);
        }}
        onSubmit={onSubmitProfile}
      />
    </Drawer>
  );
}
