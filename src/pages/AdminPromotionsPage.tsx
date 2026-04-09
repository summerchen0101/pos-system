import {
  App,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPromotionGroup,
  deletePromotionGroup,
  listPromotionGroupsAdmin,
  updatePromotionGroup,
  type AdminPromotionGroup,
  type PromotionGroupInput,
} from "../api/promotionGroupsAdmin";
import { fetchAllProducts } from "../api/fetchAllProducts";
import { ProductSelect } from "../components/admin/ProductSelect";
import { listBoothsAdmin, type AdminBooth } from "../api/boothsAdmin";
import { listGiftsAdmin, type AdminGift } from "../api/giftsAdmin";
import {
  createPromotion,
  deletePromotion,
  listPromotionsAdmin,
  setPromotionActive,
  updatePromotion,
  type PromotionInput,
  type PromotionQuantityTierInput,
  type PromotionTierInput,
} from "../api/promotionsAdmin";
import { formatMoney } from "../lib/money";
import { zhtw } from "../locales/zhTW";
import type {
  Product,
  Promotion,
  PromotionApplyMode,
  PromotionGroupBehavior,
  PromotionKind,
} from "../types/pos";

const { Title, Text } = Typography;
const pr = zhtw.admin.promotions;
const common = zhtw.common;

function dollarsToCents(d: number): number {
  return Math.round(d * 100);
}

function centsToDollars(c: number): number {
  return c / 100;
}

function groupBehaviorLabel(b: PromotionGroupBehavior): string {
  switch (b) {
    case "exclusive":
      return pr.groupsBehaviorExclusive;
    case "stackable":
      return pr.groupsBehaviorStackable;
    case "best_only":
      return pr.groupsBehaviorBestOnly;
    default: {
      const _e: never = b;
      return _e;
    }
  }
}

const KIND_OPTIONS: { value: PromotionKind; label: string }[] = [
  { value: "BUY_X_GET_Y", label: pr.kindBogo },
  { value: "BULK_DISCOUNT", label: pr.kindBulk },
  { value: "SINGLE_DISCOUNT", label: pr.kindSingle },
  { value: "TIERED", label: pr.kindTiered },
  { value: "TIERED_QUANTITY_DISCOUNT", label: pr.kindTieredQtyDiscount },
  { value: "GIFT_WITH_THRESHOLD", label: pr.kindThreshold },
  { value: "FIXED_DISCOUNT", label: pr.kindFixed },
  { value: "FREE_ITEMS", label: pr.kindFreeItems },
  { value: "FREE_SELECTION", label: pr.kindFreeSelection },
];

function formatPromotionBoothsCell(p: Promotion, totalBooths: number): string {
  if (totalBooths > 0 && p.boothIds.length >= totalBooths) {
    return pr.appliesAllBoothsLabel;
  }
  const labels = p.boothNames.filter((n) => n && n !== "—");
  if (labels.length > 0) return labels.join("、");
  return p.boothIds.join("、") || common.dash;
}

function promotionSummary(p: Promotion, products: Product[]): string {
  const dash = common.dash;
  switch (p.kind) {
    case "BUY_X_GET_Y":
      return (
        pr.summaryBogo(String(p.buyQty ?? dash), String(p.freeQty ?? dash)) +
        (p.bogoSingleDealOnly ? `（${pr.bogoSingleDealShort}）` : "")
      );
    case "BULK_DISCOUNT":
      return pr.summaryBulk(String(p.buyQty ?? dash), p.discountPercent ?? 0);
    case "SINGLE_DISCOUNT":
      return pr.summarySingle(p.discountPercent ?? 0);
    case "TIERED":
      return pr.summaryTiered(p.rules.length);
    case "TIERED_QUANTITY_DISCOUNT":
      return pr.summaryQtyDiscountTiered(p.quantityDiscountTiers.length);
    case "GIFT_WITH_THRESHOLD":
      return pr.summaryThreshold(
        formatMoney(p.thresholdAmountCents ?? 0),
        p.gift?.displayName ?? dash,
      );
    case "FIXED_DISCOUNT":
      return pr.summaryFixed(formatMoney(p.fixedDiscountCents ?? 0));
    case "FREE_ITEMS": {
      if (!p.freeItems.length) return dash;
      const byId = new Map(products.map((x) => [x.id, x]));
      return p.freeItems
        .map((f) => `${byId.get(f.productId)?.name ?? dash}×${f.quantity}`)
        .join("、");
    }
    case "FREE_SELECTION":
      return pr.summaryFreeSelection(
        p.selectableProductIds.length,
        p.maxSelectionQty ?? 0,
      );
    default:
      return dash;
  }
}

type TierFormRow = {
  min_qty: number;
  free_qty?: number | null;
  discount_percent?: number | null;
};

type QtyDiscountTierFormRow = {
  min_qty: number;
  discount_percent: number;
};

type FormValues = {
  boothIds: string[];
  groupId?: string | null;
  code?: string;
  name: string;
  kind: PromotionKind;
  applyMode: PromotionApplyMode;
  buyQty?: number | null;
  freeQty?: number | null;
  discountPercent?: number | null;
  fixedDiscountDollars?: number | null;
  active: boolean;
  productIds: string[];
  tiers?: TierFormRow[];
  qtyDiscountTiers?: QtyDiscountTierFormRow[];
  promotionGiftId?: string;
  thresholdDollars?: number | null;
  /** `FREE_ITEMS` — one row per gift product + qty. */
  freeItemRows?: { product_id: string; qty: number }[];
  /** `FREE_SELECTION` — multi-select pool. */
  selectablePoolIds?: string[];
  maxSelectionQty?: number;
  /** `BUY_X_GET_Y` — limit to one bundle (no stacked groups). */
  bogoSingleDealOnly?: boolean;
};

function buildQtyDiscountTierInputs(
  rows: QtyDiscountTierFormRow[],
): PromotionQuantityTierInput[] {
  if (rows.length === 0) return [];
  const normalized = rows.map((r, i) => ({
    min_qty: Math.trunc(Number(r.min_qty)),
    discount_percent: Math.trunc(Number(r.discount_percent)),
    _i: i,
  }));
  for (const r of normalized) {
    if (Number.isNaN(r.min_qty) || r.min_qty < 1) {
      throw new Error(pr.qtyTierMinError);
    }
    if (
      Number.isNaN(r.discount_percent) ||
      r.discount_percent < 1 ||
      r.discount_percent > 100
    ) {
      throw new Error(pr.qtyTierPctError);
    }
  }
  normalized.sort((a, b) => a.min_qty - b.min_qty || a._i - b._i);
  const seen = new Set<number>();
  for (const r of normalized) {
    if (seen.has(r.min_qty)) {
      throw new Error(pr.qtyTierDupMinError);
    }
    seen.add(r.min_qty);
  }
  return normalized.map((r, i) => ({
    minQty: r.min_qty,
    discountPercent: r.discount_percent,
    sortOrder: i,
  }));
}

function buildTierInputs(rows: TierFormRow[]): PromotionTierInput[] {
  return rows.map((t, i) => {
    const minQty = t.min_qty;
    const fq = t.free_qty;
    const dp = t.discount_percent;
    const hasFree = fq != null && fq >= 1;
    const hasPct = dp != null && dp >= 1 && dp <= 100;
    if (minQty < 1) throw new Error(pr.tierMinError(i + 1));
    if (hasFree === hasPct) {
      throw new Error(pr.tierExclusiveError(i + 1));
    }
    if (hasFree) {
      return { minQty, freeQty: fq!, discountPercent: null, sortOrder: i };
    }
    return { minQty, freeQty: null, discountPercent: dp!, sortOrder: i };
  });
}

function toInput(values: FormValues): PromotionInput {
  const boothIds = [...new Set((values.boothIds ?? []).filter(Boolean))];
  const groupId = values.groupId ?? null;
  const bogoSingleDealOnly =
    values.kind === "BUY_X_GET_Y" && !!values.bogoSingleDealOnly;
  const tiers: PromotionTierInput[] =
    values.kind === "TIERED" ? buildTierInputs(values.tiers ?? []) : [];
  const quantityTiers: PromotionQuantityTierInput[] =
    values.kind === "TIERED_QUANTITY_DISCOUNT"
      ? buildQtyDiscountTierInputs(values.qtyDiscountTiers ?? [])
      : [];
  const code = values.code?.trim() ? values.code.trim() : null;
  const name = values.name.trim();

  if (values.kind === "GIFT_WITH_THRESHOLD") {
    return {
      boothIds,
      groupId,
      code,
      name,
      kind: values.kind,
      buyQty: null,
      freeQty: null,
      discountPercent: null,
      active: values.active,
      applyMode: "AUTO",
      fixedDiscountCents: null,
      productIds: [],
      freeItems: [],
      tiers: [],
      quantityTiers: [],
      giftId: values.promotionGiftId ?? null,
      thresholdAmountCents: dollarsToCents(Number(values.thresholdDollars)),
      selectableProductIds: [],
      maxSelectionQty: null,
      bogoSingleDealOnly,
    };
  }

  const applyMode = values.applyMode ?? "AUTO";

  if (values.kind === "FIXED_DISCOUNT") {
    return {
      boothIds,
      groupId,
      code,
      name,
      kind: values.kind,
      buyQty: null,
      freeQty: null,
      discountPercent: null,
      active: values.active,
      applyMode,
      fixedDiscountCents: dollarsToCents(Number(values.fixedDiscountDollars)),
      productIds: [],
      freeItems: [],
      tiers: [],
      quantityTiers: [],
      giftId: null,
      thresholdAmountCents: null,
      selectableProductIds: [],
      maxSelectionQty: null,
      bogoSingleDealOnly,
    };
  }

  if (values.kind === "FREE_ITEMS") {
    const rows = values.freeItemRows ?? [];
    const freeItems = rows
      .filter((r) => r.product_id)
      .map((r) => ({
        productId: r.product_id,
        quantity: Math.max(1, Math.trunc(Number(r.qty) || 1)),
      }));
    return {
      boothIds,
      groupId,
      code,
      name,
      kind: "FREE_ITEMS",
      buyQty: null,
      freeQty: null,
      discountPercent: null,
      active: values.active,
      applyMode: "MANUAL",
      fixedDiscountCents: null,
      productIds: freeItems.map((x) => x.productId),
      freeItems,
      tiers: [],
      quantityTiers: [],
      giftId: null,
      thresholdAmountCents: null,
      selectableProductIds: [],
      maxSelectionQty: null,
      bogoSingleDealOnly,
    };
  }

  if (values.kind === "FREE_SELECTION") {
    const pool = values.selectablePoolIds ?? [];
    return {
      boothIds,
      groupId,
      code,
      name,
      kind: "FREE_SELECTION",
      buyQty: null,
      freeQty: null,
      discountPercent: null,
      active: values.active,
      applyMode: "MANUAL",
      fixedDiscountCents: null,
      productIds: [],
      freeItems: [],
      selectableProductIds: pool,
      maxSelectionQty: Math.max(
        1,
        Math.trunc(Number(values.maxSelectionQty) || 1),
      ),
      tiers: [],
      quantityTiers: [],
      giftId: null,
      thresholdAmountCents: null,
      bogoSingleDealOnly,
    };
  }

  if (values.kind === "TIERED") {
    return {
      boothIds,
      groupId,
      code,
      name,
      kind: values.kind,
      buyQty: null,
      freeQty: null,
      discountPercent: null,
      active: values.active,
      applyMode,
      fixedDiscountCents: null,
      productIds: values.productIds ?? [],
      freeItems: [],
      tiers,
      quantityTiers: [],
      giftId: null,
      thresholdAmountCents: null,
      selectableProductIds: [],
      maxSelectionQty: null,
      bogoSingleDealOnly,
    };
  }

  if (values.kind === "TIERED_QUANTITY_DISCOUNT") {
    return {
      boothIds,
      groupId,
      code,
      name,
      kind: values.kind,
      buyQty: null,
      freeQty: null,
      discountPercent: null,
      active: values.active,
      applyMode,
      fixedDiscountCents: null,
      productIds: values.productIds ?? [],
      freeItems: [],
      tiers: [],
      quantityTiers,
      giftId: null,
      thresholdAmountCents: null,
      selectableProductIds: [],
      maxSelectionQty: null,
      bogoSingleDealOnly,
    };
  }

  return {
    boothIds,
    groupId,
    code,
    name,
    kind: values.kind,
    buyQty: values.buyQty ?? null,
    freeQty: values.freeQty ?? null,
    discountPercent: values.discountPercent ?? null,
    active: values.active,
    applyMode,
    fixedDiscountCents: null,
    productIds: values.productIds ?? [],
    freeItems: [],
    tiers,
    quantityTiers: [],
    giftId: null,
    thresholdAmountCents: null,
    selectableProductIds: [],
    maxSelectionQty: null,
    bogoSingleDealOnly,
  };
}

export function AdminPromotionsPage() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [groupForm] = Form.useForm<{
    name: string;
    behavior: PromotionGroupBehavior;
    note?: string;
  }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promotionGroups, setPromotionGroups] = useState<AdminPromotionGroup[]>(
    [],
  );
  const [gifts, setGifts] = useState<AdminGift[]>([]);
  const [booths, setBooths] = useState<AdminBooth[]>([]);
  const [boothFilterId, setBoothFilterId] = useState<string | null>(null);
  const [groupFilterId, setGroupFilterId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("promotions");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupEditingId, setGroupEditingId] = useState<string | null>(null);
  const [groupSaving, setGroupSaving] = useState(false);

  const kindWatch = Form.useWatch("kind", form);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plist, mlist, glist, blist, pgroups] = await Promise.all([
        fetchAllProducts(),
        listPromotionsAdmin(
          boothFilterId ? { boothId: boothFilterId } : undefined,
        ),
        listGiftsAdmin(),
        listBoothsAdmin(),
        listPromotionGroupsAdmin(),
      ]);
      setProducts(plist);
      setPromotions(mlist);
      setPromotionGroups(pgroups);
      setGifts(glist);
      setBooths(blist);
    } catch (e) {
      message.error(e instanceof Error ? e.message : pr.loadError);
    } finally {
      setLoading(false);
    }
  }, [message, boothFilterId]);

  const filteredPromotions = useMemo(() => {
    if (!groupFilterId) return promotions;
    return promotions.filter((p) => p.group?.id === groupFilterId);
  }, [promotions, groupFilterId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({
      boothIds: booths.map((b) => b.id),
      groupId: undefined,
      name: "",
      code: "",
      kind: "BULK_DISCOUNT",
      applyMode: "AUTO",
      buyQty: 2,
      freeQty: null,
      discountPercent: 15,
      bogoSingleDealOnly: false,
      fixedDiscountDollars: undefined,
      active: true,
      productIds: [],
      tiers: [],
      qtyDiscountTiers: [],
      promotionGiftId: undefined,
      thresholdDollars: undefined,
    });
    setModalOpen(true);
  };

  const openEdit = (p: Promotion) => {
    setEditingId(p.id);
    form.setFieldsValue({
      boothIds: [...p.boothIds],
      groupId: p.groupId ?? p.group?.id,
      name: p.name,
      code: p.code ?? "",
      kind: p.kind,
      applyMode:
        p.kind === "GIFT_WITH_THRESHOLD"
          ? "AUTO"
          : p.kind === "FREE_ITEMS" || p.kind === "FREE_SELECTION"
            ? "MANUAL"
            : p.applyMode,
      buyQty: p.buyQty,
      freeQty: p.freeQty,
      discountPercent: p.discountPercent,
      fixedDiscountDollars:
        p.kind === "FIXED_DISCOUNT" && p.fixedDiscountCents != null
          ? centsToDollars(p.fixedDiscountCents)
          : undefined,
      active: p.active,
      productIds:
        p.kind === "GIFT_WITH_THRESHOLD" ||
        p.kind === "FIXED_DISCOUNT" ||
        p.kind === "FREE_ITEMS" ||
        p.kind === "FREE_SELECTION"
          ? []
          : p.productIds,
      freeItemRows:
        p.kind === "FREE_ITEMS"
          ? p.freeItems.length > 0
            ? p.freeItems.map((x) => ({
                product_id: x.productId,
                qty: x.quantity,
              }))
            : [{ product_id: "", qty: 1 }]
          : undefined,
      tiers:
        p.kind === "TIERED"
          ? p.rules.map((r) => ({
              min_qty: r.minQty,
              free_qty: r.freeQty ?? undefined,
              discount_percent: r.discountPercent ?? undefined,
            }))
          : [],
      qtyDiscountTiers:
        p.kind === "TIERED_QUANTITY_DISCOUNT"
          ? p.quantityDiscountTiers.map((t) => ({
              min_qty: t.minQty,
              discount_percent: t.discountPercent,
            }))
          : [],
      promotionGiftId: p.giftId ?? undefined,
      thresholdDollars:
        p.kind === "GIFT_WITH_THRESHOLD" && p.thresholdAmountCents != null
          ? centsToDollars(p.thresholdAmountCents)
          : undefined,
      selectablePoolIds:
        p.kind === "FREE_SELECTION" ? p.selectableProductIds : undefined,
      maxSelectionQty:
        p.kind === "FREE_SELECTION" ? (p.maxSelectionQty ?? 1) : undefined,
      bogoSingleDealOnly:
        p.kind === "BUY_X_GET_Y" ? p.bogoSingleDealOnly : false,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    form.resetFields();
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      if (
        values.kind === "TIERED" &&
        (!values.tiers || values.tiers.length === 0)
      ) {
        message.error(pr.addTierError);
        return;
      }
      if (
        values.kind === "TIERED_QUANTITY_DISCOUNT" &&
        (!values.qtyDiscountTiers || values.qtyDiscountTiers.length === 0)
      ) {
        message.error(pr.addQtyTierError);
        return;
      }
      if (values.kind === "GIFT_WITH_THRESHOLD") {
        if (!values.promotionGiftId) {
          message.error(pr.selectGiftError);
          return;
        }
        if (
          values.thresholdDollars == null ||
          Number(values.thresholdDollars) <= 0
        ) {
          message.error(pr.thresholdError);
          return;
        }
      }
      if (values.kind === "FIXED_DISCOUNT") {
        if (
          values.fixedDiscountDollars == null ||
          Number(values.fixedDiscountDollars) <= 0
        ) {
          message.error(pr.fixedDiscountError);
          return;
        }
      }
      if (values.kind === "FREE_ITEMS") {
        const rows = values.freeItemRows ?? [];
        if (rows.length < 1) {
          message.error(pr.freeItemsNeedRow);
          return;
        }
        const seen = new Set<string>();
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i]!;
          if (!r.product_id) {
            message.error(pr.freeItemsProductError(i + 1));
            return;
          }
          if (seen.has(r.product_id)) {
            message.error(pr.freeItemsDupProduct);
            return;
          }
          seen.add(r.product_id);
          if (r.qty == null || Number(r.qty) < 1) {
            message.error(pr.freeItemsQtyError);
            return;
          }
        }
      }
      if (values.kind === "FREE_SELECTION") {
        const pool = values.selectablePoolIds ?? [];
        if (pool.length < 1) {
          message.error(pr.selectablePoolError);
          return;
        }
        if (
          values.maxSelectionQty == null ||
          Number(values.maxSelectionQty) < 1
        ) {
          message.error(pr.maxSelectionQtyError);
          return;
        }
      }
      if (!values.boothIds?.length) {
        message.error(pr.boothRequired);
        return;
      }
      let input: PromotionInput;
      try {
        input = toInput(values);
      } catch (err) {
        message.error(err instanceof Error ? err.message : pr.invalidTiers);
        return;
      }
      if (
        input.kind !== "GIFT_WITH_THRESHOLD" &&
        input.kind !== "FIXED_DISCOUNT" &&
        input.kind !== "FREE_ITEMS" &&
        input.kind !== "FREE_SELECTION" &&
        input.productIds.length === 0
      ) {
        message.error(pr.selectProductError);
        return;
      }
      if (
        input.kind === "FREE_SELECTION" &&
        input.selectableProductIds.length === 0
      ) {
        message.error(pr.selectablePoolError);
        return;
      }
      if (input.kind === "FREE_ITEMS" && input.freeItems.length === 0) {
        message.error(pr.freeItemsNeedRow);
        return;
      }
      if (
        input.kind === "GIFT_WITH_THRESHOLD" &&
        (!input.thresholdAmountCents || input.thresholdAmountCents < 1)
      ) {
        message.error(pr.thresholdError);
        return;
      }
      if (
        input.kind === "FIXED_DISCOUNT" &&
        (!input.fixedDiscountCents || input.fixedDiscountCents < 1)
      ) {
        message.error(pr.fixedDiscountError);
        return;
      }
      setSaving(true);
      if (editingId) {
        await updatePromotion(editingId, input);
        message.success(pr.updated);
      } else {
        await createPromotion(input);
        message.success(pr.created);
      }
      closeModal();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(e instanceof Error ? e.message : pr.saveError);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (p: Promotion) => {
    modal.confirm({
      title: pr.deleteTitle,
      content: pr.deleteBody(p.name),
      okText: common.delete,
      okButtonProps: { danger: true },
      onOk: async () => {
        await deletePromotion(p.id);
        message.success(pr.deleted);
        await load();
      },
    });
  };

  const openCreateGroup = () => {
    setGroupEditingId(null);
    groupForm.resetFields();
    groupForm.setFieldsValue({
      name: "",
      behavior: "stackable",
      note: "",
    });
    setGroupModalOpen(true);
  };

  const openEditGroup = (g: AdminPromotionGroup) => {
    setGroupEditingId(g.id);
    groupForm.setFieldsValue({
      name: g.name,
      behavior: g.behavior,
      note: g.note ?? "",
    });
    setGroupModalOpen(true);
  };

  const closeGroupModal = () => {
    setGroupModalOpen(false);
    setGroupEditingId(null);
    groupForm.resetFields();
  };

  const submitGroup = async () => {
    try {
      const v = await groupForm.validateFields();
      const input: PromotionGroupInput = {
        name: v.name,
        behavior: v.behavior,
        note: v.note?.trim() ? v.note.trim() : null,
      };
      setGroupSaving(true);
      if (groupEditingId) await updatePromotionGroup(groupEditingId, input);
      else await createPromotionGroup(input);
      message.success(pr.groupsSaved);
      closeGroupModal();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(e instanceof Error ? e.message : pr.groupsSaveError);
    } finally {
      setGroupSaving(false);
    }
  };

  const onDeleteGroup = (g: AdminPromotionGroup) => {
    const n = promotions.filter((p) => p.group?.id === g.id).length;
    modal.confirm({
      title: pr.groupsDeleteTitle,
      content: n > 0 ? pr.groupsDeleteBody(n) : pr.groupsDeleteEmptyBody,
      okText: common.delete,
      okButtonProps: { danger: true },
      onOk: async () => {
        await deletePromotionGroup(g.id);
        message.success(pr.groupsDeleted);
        await load();
      },
    });
  };

  const onToggleActive = async (p: Promotion, active: boolean) => {
    try {
      await setPromotionActive(p.id, active);
      message.success(active ? pr.activated : pr.deactivated);
      await load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : pr.updateError);
    }
  };

  const giftOptions = gifts.map((x) => ({
    label: x.name,
    value: x.id,
  }));

  const boothOptions = booths.map((b) => ({
    label: b.location ? `${b.name}（${b.location}）` : b.name,
    value: b.id,
  }));

  const columns: ColumnsType<Promotion> = [
    {
      title: pr.colName,
      dataIndex: "name",
      key: "name",
      render: (name: string, row) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {row.code ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.code}
            </Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: pr.colBooth,
      key: "booth",
      width: 140,
      ellipsis: true,
      render: (_, row) => formatPromotionBoothsCell(row, booths.length),
    },
    {
      title: pr.colGroup,
      key: "grp",
      width: 120,
      ellipsis: true,
      render: (_, row) => row.group?.name ?? common.dash,
    },
    {
      title: pr.colApplyMode,
      key: "apply",
      width: 88,
      render: (_, row) => (
        <Tag color={row.applyMode === "MANUAL" ? "gold" : "default"}>
          {row.kind === "GIFT_WITH_THRESHOLD"
            ? pr.applyAuto
            : row.kind === "FREE_ITEMS" || row.kind === "FREE_SELECTION"
              ? pr.applyManual
              : row.applyMode === "MANUAL"
                ? pr.applyManual
                : pr.applyAuto}
        </Tag>
      ),
    },
    {
      title: pr.colType,
      dataIndex: "kind",
      key: "kind",
      width: 160,
      render: (k: PromotionKind) => (
        <Tag>{KIND_OPTIONS.find((o) => o.value === k)?.label ?? k}</Tag>
      ),
    },
    {
      title: pr.colRule,
      key: "rule",
      render: (_, row) => promotionSummary(row, products),
    },
    {
      title: pr.colProducts,
      key: "pc",
      width: 72,
      align: "center",
      render: (_, row) =>
        row.kind === "GIFT_WITH_THRESHOLD" || row.kind === "FIXED_DISCOUNT"
          ? common.dash
          : row.kind === "FREE_ITEMS"
            ? row.freeItems.length
            : row.kind === "FREE_SELECTION"
              ? row.selectableProductIds.length
              : row.productIds.length,
    },
    {
      title: pr.colActive,
      dataIndex: "active",
      key: "active",
      width: 100,
      render: (active: boolean, row) => (
        <Switch
          checked={active}
          onChange={(v) => void onToggleActive(row, v)}
        />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 160,
      render: (_, row) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(row)}>
            {common.edit}
          </Button>
          <Button type="link" size="small" danger onClick={() => onDelete(row)}>
            {common.delete}
          </Button>
        </Space>
      ),
    },
  ];

  const groupColumns: ColumnsType<AdminPromotionGroup> = [
    {
      title: pr.groupsColName,
      dataIndex: "name",
      key: "name",
    },
    {
      title: pr.groupsColBehavior,
      key: "behavior",
      width: 120,
      render: (_, row) => groupBehaviorLabel(row.behavior),
    },
    {
      title: pr.groupsColNote,
      dataIndex: "note",
      key: "note",
      ellipsis: true,
      render: (note: string | null) => note?.trim() || common.dash,
    },
    {
      title: pr.groupsColPromoCount,
      key: "pc",
      width: 100,
      align: "center",
      render: (_, row) =>
        promotions.filter((p) => p.group?.id === row.id).length,
    },
    {
      title: "",
      key: "actions",
      width: 160,
      render: (_, row) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEditGroup(row)}>
            {common.edit}
          </Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => onDeleteGroup(row)}>
            {common.delete}
          </Button>
        </Space>
      ),
    },
  ];

  const groupFilterOptions = useMemo(
    () =>
      promotionGroups.map((g) => ({
        label: g.name,
        value: g.id,
      })),
    [promotionGroups],
  );

  return (
    <div className="admin-page admin-promotions">
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "promotions",
            label: pr.tabPromotions,
            children: (
              <Space
                direction="vertical"
                size="large"
                style={{ width: "100%" }}>
                <Space
                  align="center"
                  style={{ justifyContent: "space-between", width: "100%" }}>
                  <Title level={4} style={{ margin: 0 }}>
                    {pr.pageTitle}
                  </Title>
                  <Button type="primary" onClick={openCreate}>
                    {pr.newPromotion}
                  </Button>
                </Space>

                <Space wrap align="center">
                  <Text>{pr.filterBooth}</Text>
                  <Select
                    allowClear
                    placeholder={pr.filterBoothAll}
                    style={{ minWidth: 220 }}
                    options={boothOptions}
                    value={boothFilterId ?? undefined}
                    onChange={(v) => setBoothFilterId(v ?? null)}
                    optionFilterProp="label"
                  />
                  <Text>{pr.filterGroup}</Text>
                  <Select
                    allowClear
                    placeholder={pr.filterGroupAll}
                    style={{ minWidth: 200 }}
                    options={groupFilterOptions}
                    value={groupFilterId ?? undefined}
                    onChange={(v) => setGroupFilterId(v ?? null)}
                    optionFilterProp="label"
                  />
                </Space>

                <Card>
                  <Table<Promotion>
                    rowKey="id"
                    loading={loading}
                    columns={columns}
                    dataSource={filteredPromotions}
                    pagination={{ pageSize: 10 }}
                  />
                </Card>
              </Space>
            ),
          },
          {
            key: "groups",
            label: pr.tabGroups,
            children: (
              <Space
                direction="vertical"
                size="large"
                style={{ width: "100%" }}>
                <Space
                  align="center"
                  style={{ justifyContent: "space-between", width: "100%" }}>
                  <Title level={4} style={{ margin: 0 }}>
                    {pr.groupsPageTitle}
                  </Title>
                  <Button type="primary" onClick={openCreateGroup}>
                    {pr.groupsNew}
                  </Button>
                </Space>
                <Card>
                  <Table<AdminPromotionGroup>
                    rowKey="id"
                    loading={loading}
                    columns={groupColumns}
                    dataSource={promotionGroups}
                    pagination={{ pageSize: 10 }}
                  />
                </Card>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={groupEditingId ? pr.groupsModalEdit : pr.groupsModalCreate}
        open={groupModalOpen}
        onCancel={closeGroupModal}
        onOk={() => void submitGroup()}
        confirmLoading={groupSaving}
        destroyOnClose
        okText={common.save}>
        <Form form={groupForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="name"
            label={pr.groupsLabelName}
            rules={[{ required: true, message: common.required }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="behavior"
            label={pr.groupsLabelBehavior}
            rules={[{ required: true }]}>
            <Radio.Group style={{ width: "100%" }}>
              <Space direction="vertical" size="small">
                <Radio value="exclusive">
                  {pr.groupsBehaviorExclusive} — {pr.groupsBehaviorExclusiveDesc}
                </Radio>
                <Radio value="stackable">
                  {pr.groupsBehaviorStackable} — {pr.groupsBehaviorStackableDesc}
                </Radio>
                <Radio value="best_only">
                  {pr.groupsBehaviorBestOnly} — {pr.groupsBehaviorBestOnlyDesc}
                </Radio>
              </Space>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="note" label={pr.groupsLabelNote}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingId ? pr.modalEdit : pr.modalCreate}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void submit()}
        confirmLoading={saving}
        destroyOnClose
        width={720}
        okText={common.save}>
        <Form<FormValues>
          form={form}
          layout="vertical"
          style={{ marginTop: 8 }}
          onValuesChange={(changed) => {
            if ("kind" in changed) {
              const k = changed.kind as PromotionKind;
              if (k === "BUY_X_GET_Y") {
                form.setFieldsValue({
                  buyQty: form.getFieldValue("buyQty") ?? 2,
                  freeQty: form.getFieldValue("freeQty") ?? 1,
                  discountPercent: null,
                  bogoSingleDealOnly: false,
                  tiers: [],
                  qtyDiscountTiers: [],
                });
              } else if (k === "BULK_DISCOUNT") {
                form.setFieldsValue({
                  buyQty: form.getFieldValue("buyQty") ?? 2,
                  freeQty: null,
                  discountPercent: form.getFieldValue("discountPercent") ?? 15,
                  tiers: [],
                  qtyDiscountTiers: [],
                });
              } else if (k === "TIERED") {
                const cur = form.getFieldValue("tiers") as
                  | TierFormRow[]
                  | undefined;
                if (!cur?.length) {
                  form.setFieldsValue({
                    buyQty: null,
                    freeQty: null,
                    discountPercent: null,
                    qtyDiscountTiers: [],
                    tiers: [
                      { min_qty: 6, free_qty: 1 },
                      { min_qty: 10, free_qty: 2 },
                    ],
                  });
                } else {
                  form.setFieldsValue({
                    buyQty: null,
                    freeQty: null,
                    discountPercent: null,
                    qtyDiscountTiers: [],
                  });
                }
              } else if (k === "TIERED_QUANTITY_DISCOUNT") {
                const cur = form.getFieldValue("qtyDiscountTiers") as
                  | QtyDiscountTierFormRow[]
                  | undefined;
                if (!cur?.length) {
                  form.setFieldsValue({
                    buyQty: null,
                    freeQty: null,
                    discountPercent: null,
                    tiers: [],
                    qtyDiscountTiers: [
                      { min_qty: 1, discount_percent: 5 },
                      { min_qty: 2, discount_percent: 10 },
                      { min_qty: 3, discount_percent: 15 },
                    ],
                  });
                } else {
                  form.setFieldsValue({
                    buyQty: null,
                    freeQty: null,
                    discountPercent: null,
                    tiers: [],
                  });
                }
              } else if (k === "GIFT_WITH_THRESHOLD") {
                form.setFieldsValue({
                  buyQty: null,
                  freeQty: null,
                  discountPercent: null,
                  tiers: [],
                  qtyDiscountTiers: [],
                  productIds: [],
                  applyMode: "AUTO",
                  thresholdDollars:
                    form.getFieldValue("thresholdDollars") ?? 500,
                });
              } else if (k === "FIXED_DISCOUNT") {
                form.setFieldsValue({
                  buyQty: null,
                  freeQty: null,
                  discountPercent: null,
                  tiers: [],
                  qtyDiscountTiers: [],
                  productIds: [],
                  applyMode: "MANUAL",
                  fixedDiscountDollars:
                    form.getFieldValue("fixedDiscountDollars") ?? 50,
                });
              } else if (k === "FREE_ITEMS") {
                const cur = form.getFieldValue("freeItemRows") as
                  | FormValues["freeItemRows"]
                  | undefined;
                form.setFieldsValue({
                  buyQty: null,
                  discountPercent: null,
                  tiers: [],
                  qtyDiscountTiers: [],
                  applyMode: "MANUAL",
                  productIds: [],
                  freeQty: null,
                  freeItemRows: cur?.length
                    ? cur
                    : [{ product_id: "", qty: 1 }],
                });
              } else if (k === "FREE_SELECTION") {
                form.setFieldsValue({
                  buyQty: null,
                  freeQty: null,
                  discountPercent: null,
                  tiers: [],
                  qtyDiscountTiers: [],
                  applyMode: "MANUAL",
                  productIds: [],
                  freeItemRows: undefined,
                  selectablePoolIds: form.getFieldValue("selectablePoolIds")
                    ?.length
                    ? form.getFieldValue("selectablePoolIds")
                    : [],
                  maxSelectionQty: form.getFieldValue("maxSelectionQty") ?? 3,
                });
              } else {
                form.setFieldsValue({
                  buyQty: null,
                  freeQty: null,
                  discountPercent: form.getFieldValue("discountPercent") ?? 10,
                  tiers: [],
                  qtyDiscountTiers: [],
                });
              }
            }
          }}>
          <Form.Item
            name="boothIds"
            label={pr.labelBooth}
            rules={[{ required: true, message: pr.boothRequired }]}>
            <Select
              mode="multiple"
              allowClear
              options={boothOptions}
              placeholder={pr.boothPh}
              optionFilterProp="label"
              showSearch
            />
          </Form.Item>
          <Form.Item
            name="name"
            label={pr.labelName}
            rules={[{ required: true, message: common.required }]}>
            <Input placeholder={pr.namePh} />
          </Form.Item>
          <Form.Item name="code" label={pr.labelCode}>
            <Input placeholder={pr.codePh} />
          </Form.Item>
          <Form.Item name="groupId" label={pr.labelGroup}>
            <Select
              allowClear
              placeholder={pr.groupNoneOption}
              options={promotionGroups.map((g) => ({
                label: g.name,
                value: g.id,
              }))}
              optionFilterProp="label"
              showSearch
            />
          </Form.Item>
          <Form.Item
            name="kind"
            label={pr.labelKind}
            rules={[{ required: true }]}>
            <Select
              options={KIND_OPTIONS}
              optionFilterProp="label"
              placeholder={pr.kindPh}
            />
          </Form.Item>

          {kindWatch &&
          kindWatch !== "GIFT_WITH_THRESHOLD" &&
          kindWatch !== "FREE_ITEMS" &&
          kindWatch !== "FREE_SELECTION" ? (
            <Form.Item
              name="applyMode"
              label={pr.labelApplyMode}
              rules={[{ required: true }]}>
              <Select
                options={[
                  { value: "AUTO", label: pr.applyAuto },
                  { value: "MANUAL", label: pr.applyManual },
                ]}
              />
            </Form.Item>
          ) : null}

          {kindWatch === "BUY_X_GET_Y" && (
            <Space size="middle" style={{ display: "flex" }}>
              <Form.Item
                name="buyQty"
                label={pr.buyX}
                rules={[{ required: true, type: "number", min: 1 }]}
                style={{ flex: 1 }}>
                <InputNumber
                  min={1}
                  style={{ width: "100%" }}
                  placeholder={pr.phX}
                />
              </Form.Item>
              <Form.Item
                name="freeQty"
                label={pr.freeY}
                rules={[{ required: true, type: "number", min: 1 }]}
                style={{ flex: 1 }}>
                <InputNumber
                  min={1}
                  style={{ width: "100%" }}
                  placeholder={pr.phY}
                />
              </Form.Item>
            </Space>
          )}

          {kindWatch === "BUY_X_GET_Y" ? (
            <Form.Item
              name="bogoSingleDealOnly"
              valuePropName="checked"
              extra={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {pr.bogoSingleDealHint}
                </Text>
              }>
              <Checkbox>{pr.labelBogoSingleDeal}</Checkbox>
            </Form.Item>
          ) : null}

          {kindWatch === "BULK_DISCOUNT" && (
            <Space size="middle" style={{ display: "flex" }}>
              <Form.Item
                name="buyQty"
                label={pr.minUnits}
                rules={[{ required: true, type: "number", min: 1 }]}
                style={{ flex: 1 }}>
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item
                name="discountPercent"
                label={pr.discountPct}
                rules={[{ required: true, type: "number", min: 1, max: 100 }]}
                style={{ flex: 1 }}>
                <InputNumber min={1} max={100} style={{ width: "100%" }} />
              </Form.Item>
            </Space>
          )}

          {kindWatch === "SINGLE_DISCOUNT" && (
            <Form.Item
              name="discountPercent"
              label={pr.discountPct}
              rules={[{ required: true, type: "number", min: 1, max: 100 }]}>
              <InputNumber min={1} max={100} style={{ width: "100%" }} />
            </Form.Item>
          )}

          {kindWatch === "TIERED" && (
            <Form.Item label={pr.tiersLabel}>
              <Form.List name="tiers">
                {(fields, { add, remove }) => (
                  <Space
                    direction="vertical"
                    style={{ width: "100%" }}
                    size="small">
                    {fields.map((field) => (
                      <Space key={field.key} wrap style={{ width: "100%" }}>
                        <Form.Item
                          name={[field.name, "min_qty"]}
                          rules={[{ required: true, type: "number", min: 1 }]}
                          style={{ marginBottom: 0, width: 120 }}>
                          <InputNumber
                            min={1}
                            placeholder={pr.minQty}
                            style={{ width: "100%" }}
                          />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, "free_qty"]}
                          style={{ marginBottom: 0, width: 120 }}>
                          <InputNumber
                            min={1}
                            placeholder={pr.freeQty}
                            style={{ width: "100%" }}
                          />
                        </Form.Item>
                        <Text type="secondary">{pr.or}</Text>
                        <Form.Item
                          name={[field.name, "discount_percent"]}
                          style={{ marginBottom: 0, width: 120 }}>
                          <InputNumber
                            min={1}
                            max={100}
                            placeholder={pr.pctOff}
                            style={{ width: "100%" }}
                          />
                        </Form.Item>
                        <Button
                          type="text"
                          danger
                          onClick={() => remove(field.name)}>
                          {pr.removeTier}
                        </Button>
                      </Space>
                    ))}
                    <Button
                      type="dashed"
                      onClick={() => add({ min_qty: 1 })}
                      block>
                      {pr.addTier}
                    </Button>
                  </Space>
                )}
              </Form.List>
            </Form.Item>
          )}

          {kindWatch === "TIERED_QUANTITY_DISCOUNT" && (
            <Form.Item
              label={pr.qtyDiscountTiersLabel}
              extra={pr.qtyDiscountTiersExtra}>
              <Form.List name="qtyDiscountTiers">
                {(fields, { add, remove }) => (
                  <Space
                    direction="vertical"
                    style={{ width: "100%" }}
                    size="small">
                    {fields.map((field) => (
                      <Space key={field.key} wrap style={{ width: "100%" }}>
                        <Form.Item
                          name={[field.name, "min_qty"]}
                          rules={[{ required: true, type: "number", min: 1 }]}
                          style={{ marginBottom: 0, width: 120 }}>
                          <InputNumber
                            min={1}
                            placeholder={pr.minQty}
                            style={{ width: "100%" }}
                          />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, "discount_percent"]}
                          rules={[
                            {
                              required: true,
                              type: "number",
                              min: 1,
                              max: 100,
                            },
                          ]}
                          style={{ marginBottom: 0, width: 120 }}>
                          <InputNumber
                            min={1}
                            max={100}
                            placeholder={pr.pctOff}
                            style={{ width: "100%" }}
                            addonAfter="%OFF"
                          />
                        </Form.Item>
                        <Button
                          type="text"
                          danger
                          onClick={() => remove(field.name)}>
                          {pr.removeTier}
                        </Button>
                      </Space>
                    ))}
                    <Button
                      type="dashed"
                      onClick={() => add({ min_qty: 1, discount_percent: 5 })}
                      block>
                      {pr.addQtyDiscountTier}
                    </Button>
                  </Space>
                )}
              </Form.List>
            </Form.Item>
          )}

          {kindWatch === "GIFT_WITH_THRESHOLD" ? (
            <>
              <Form.Item
                name="promotionGiftId"
                label={pr.labelGift}
                rules={[{ required: true, message: pr.selectGiftError }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={pr.giftPh}
                  options={giftOptions}
                />
              </Form.Item>
              <Form.Item
                name="thresholdDollars"
                label={pr.labelThreshold}
                rules={[{ required: true, type: "number", min: 0.01 }]}
                extra={pr.thresholdExtra}>
                <InputNumber
                  min={0.01}
                  step={1}
                  style={{ width: "100%" }}
                  placeholder={pr.thresholdPh}
                />
              </Form.Item>
            </>
          ) : kindWatch === "FIXED_DISCOUNT" ? (
            <Form.Item
              name="fixedDiscountDollars"
              label={pr.labelFixedDiscount}
              rules={[{ required: true, type: "number", min: 0.01 }]}
              extra={pr.fixedDiscountExtra}>
              <InputNumber
                min={0.01}
                step={1}
                style={{ width: "100%" }}
                placeholder={pr.fixedDiscountPh}
              />
            </Form.Item>
          ) : kindWatch === "FREE_SELECTION" ? (
            <>
              <Form.Item
                name="selectablePoolIds"
                label={pr.labelSelectablePool}
                rules={[{ required: true, message: pr.selectablePoolError }]}>
                <ProductSelect
                  multiple
                  placeholder={pr.productsPh}
                  products={products}
                  style={{ width: "100%" }}
                />
              </Form.Item>
              <Form.Item
                name="maxSelectionQty"
                label={pr.labelMaxSelectionQty}
                rules={[{ required: true, type: "number", min: 1 }]}>
                <InputNumber
                  min={1}
                  precision={0}
                  style={{ width: "100%" }}
                  placeholder={pr.maxSelectionQtyPh}
                />
              </Form.Item>
            </>
          ) : kindWatch === "FREE_ITEMS" ? (
            <Form.Item label={pr.freeItemsSection} required>
              <Form.List name="freeItemRows">
                {(fields, { add, remove }) => (
                  <Space
                    direction="vertical"
                    style={{ width: "100%" }}
                    size="small">
                    {fields.map((field) => (
                      <Space
                        key={field.key}
                        wrap
                        style={{ width: "100%" }}
                        align="baseline">
                        <Form.Item
                          name={[field.name, "product_id"]}
                          rules={[
                            {
                              required: true,
                              message: pr.freeItemsSelectProduct,
                            },
                          ]}
                          style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
                          <ProductSelect
                            placeholder={pr.productsPh}
                            products={products}
                            style={{ width: "100%" }}
                          />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, "qty"]}
                          rules={[
                            {
                              required: true,
                              type: "number",
                              min: 1,
                              message: pr.freeItemsQtyError,
                            },
                          ]}
                          style={{ marginBottom: 0, width: 120 }}>
                          <InputNumber
                            min={1}
                            precision={0}
                            style={{ width: "100%" }}
                          />
                        </Form.Item>
                        <Button
                          type="text"
                          danger
                          onClick={() => remove(field.name)}>
                          {pr.freeItemsRemoveRow}
                        </Button>
                      </Space>
                    ))}
                    <Button
                      type="dashed"
                      onClick={() => add({ product_id: "", qty: 1 })}
                      block>
                      {pr.freeItemsAddRow}
                    </Button>
                  </Space>
                )}
              </Form.List>
            </Form.Item>
          ) : (
            <Form.Item
              name="productIds"
              label={pr.labelProducts}
              rules={[
                ({ getFieldValue }) => ({
                  validator: async (_, v: string[]) => {
                    const k = getFieldValue("kind") as PromotionKind;
                    if (
                      k === "GIFT_WITH_THRESHOLD" ||
                      k === "FIXED_DISCOUNT" ||
                      k === "FREE_ITEMS" ||
                      k === "FREE_SELECTION"
                    )
                      return;
                    if (!v?.length) throw new Error(pr.validatorProducts);
                  },
                }),
              ]}>
              <ProductSelect
                multiple
                placeholder={pr.productsPh}
                products={products}
                style={{ width: "100%" }}
              />
            </Form.Item>
          )}

          <Form.Item name="active" label={pr.colActive} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
