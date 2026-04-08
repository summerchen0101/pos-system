import type { OrderAppliedPromotion, OrderGiftItem, OrderPromotionSnapshot } from "../types/order";

export type FormattedOrderPromotion = {
  key: string;
  name: string;
  description: string;
  discountAmount: number;
  gifts: { name: string; quantity: number }[];
  isManual: boolean;
};

function baseId(raw?: string | null): string {
  return String(raw ?? "").trim().split("~")[0] ?? "";
}

function findSnapshotDescription(
  snapshot: OrderPromotionSnapshot | null,
  promotionId: string | null,
  name: string,
): string {
  if (!snapshot) return "";
  const b = baseId(promotionId);
  const byId = snapshot.promotions.find((p) => b && baseId(p.promotionId) === b);
  if (byId) return byId.description || byId.selectedItemsSummary || "";
  const byName = snapshot.promotions.find((p) => p.name === name || name.includes(p.name) || p.name.includes(name));
  return byName ? byName.description || byName.selectedItemsSummary || "" : "";
}

function getPromotionDescription(
  promotionType: string,
  matchedTier?: {
    buy_quantity?: number;
    get_quantity?: number;
    nth?: number;
    discount_type?: "percent" | "fixed";
    discount_value?: number;
  } | null,
): string {
  const t = matchedTier ?? null;
  if (!t) return "";
  if (t.buy_quantity != null && t.get_quantity != null) {
    return `買 ${t.buy_quantity} 送 ${t.get_quantity}`;
  }
  if (promotionType.toLowerCase() === "nth_item_discount" && t.nth != null && t.discount_value != null) {
    if (t.discount_type === "percent") return `第 ${t.nth} 件打 ${t.discount_value} 折`;
    if (t.discount_type === "fixed") return `第 ${t.nth} 件折 NT$${t.discount_value}`;
  }
  return "";
}

export function formatOrderPromotions(
  orderPromotions: OrderAppliedPromotion[],
  snapshot: OrderPromotionSnapshot | null,
  orderGiftItems: OrderGiftItem[] = [],
): FormattedOrderPromotion[] {
  const rows: FormattedOrderPromotion[] = [];
  const seen = new Set<string>();

  for (const op of orderPromotions) {
    const key = `${baseId(op.promotionId)}|${op.promotionName}|${op.discountAmount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      key,
      name: op.promotionName,
      description:
        getPromotionDescription(op.promotionType, op.matchedTier ?? null) ||
        findSnapshotDescription(snapshot, op.promotionId, op.promotionName),
      discountAmount: op.discountAmount,
      gifts: [],
      isManual: op.promotionType.toUpperCase() === "MANUAL",
    });
  }

  for (const summary of snapshot?.thresholdGiftSummaries ?? []) {
    const key = `threshold|${summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      key,
      name: summary,
      description: summary,
      discountAmount: 0,
      gifts: orderGiftItems.map((g) => ({ name: g.giftName, quantity: g.quantity })),
      isManual: false,
    });
  }

  return rows;
}
