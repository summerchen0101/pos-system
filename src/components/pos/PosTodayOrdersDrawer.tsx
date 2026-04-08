import { App, Button, Drawer, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { useCallback, useEffect, useMemo, useState } from "react";
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

function lineTotalLabel(r: PosOrderLineJson): string {
  return formatMoney(r.line_total_cents);
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) =>
        dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf(),
      ),
    [rows],
  );

  const toggleExpanded = (orderId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

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
      <div className="pos-today-orders-cards">
        {loading ? (
          <Typography.Text type="secondary">{zhtw.common.loading}</Typography.Text>
        ) : sortedRows.length === 0 ? (
          <Typography.Text type="secondary">{p.empty}</Typography.Text>
        ) : (
          sortedRows.map((r) => {
            const hasProfile = Boolean(r.buyer_gender || r.buyer_age_group || r.buyer_motivation);
            const summary = summaryProfile(r);
            const expanded = expandedIds.has(r.id);
            return (
              <div key={r.id} className="pos-today-orders-card">
                <div className="pos-today-orders-card__row1">
                  <span className="pos-today-orders-card__time">
                    {dayjs(r.created_at).tz("Asia/Taipei").format("HH:mm")}
                  </span>
                  <span className="pos-today-orders-card__summary">{buildPreview(r.items ?? [])}</span>
                  <span className="pos-today-orders-card__final">
                    {formatMoney(r.final_amount)}
                  </span>
                  <Button
                    type="link"
                    size="small"
                    className="pos-today-orders-card__delete"
                    danger
                    onClick={() => onDelete(r)}
                    style={{ padding: 0 }}
                  >
                    {zhtw.common.delete}
                  </Button>
                </div>
                <div className="pos-today-orders-card__divider" />
                <div className="pos-today-orders-card__row2">
                  <div>
                    {!hasProfile ? (
                      <button
                        type="button"
                        className="pos-today-orders-card__profile-new"
                        onClick={() => openProfileEditor(r)}
                      >
                        {p.addBuyerProfile}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="pos-today-orders-card__profile-pill"
                        onClick={() => openProfileEditor(r)}
                      >
                        {summary}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="pos-today-orders-card__expand"
                    onClick={() => toggleExpanded(r.id)}
                  >
                    {expanded ? `▲ ${p.collapseDetail}` : `▼ ${p.expandDetail}`}
                  </button>
                </div>
                {expanded ? (
                  <div className="pos-today-orders-card__detail">
                    <div className="pos-today-orders-card__detail-head">
                      <span>{p.colProduct}</span>
                      <span>{p.colSize}</span>
                      <span>{p.colQty}</span>
                      <span>{p.colUnitPrice}</span>
                      <span>{p.colLineTotal}</span>
                    </div>
                    {(r.items ?? []).map((item) => (
                      <div key={item.id} className="pos-today-orders-card__detail-row">
                        <span className="pos-today-orders-card__detail-product">
                          <Space size={4} wrap>
                            <span>{item.product_name}</span>
                            {lineTag(item.source, item.is_gift)}
                          </Space>
                        </span>
                        <span>{item.size?.trim() || "—"}</span>
                        <span>{item.quantity}</span>
                        <span>{formatMoney(item.unit_price_cents)}</span>
                        <span>{lineTotalLabel(item)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
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
        onSkip={() => {
          setProfileOpen(false);
          setEditingOrder(null);
        }}
        onSubmit={onSubmitProfile}
      />
    </Drawer>
  );
}
