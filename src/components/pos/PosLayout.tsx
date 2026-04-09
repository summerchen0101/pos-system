import { Button, Space, Typography } from "antd";
import { Home } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { fetchActiveStaffNamesForBooth } from "../../api/posActiveStaff";
import { fetchScheduledStaffNamesForBooth } from "../../api/posCheckoutStaff";
import { fetchProductsForPosBooth } from "../../api/fetchProducts";
import { fetchPromotions } from "../../api/fetchPromotions";
import { PosCashierProvider } from "../../context/PosCashierContext";
import { useManualFreeLineSync } from "../../hooks/useManualFreeLineSync";
import { usePruneManualPromotionGroups } from "../../hooks/usePruneManualPromotionGroups";
import { useThresholdGiftSync } from "../../hooks/useThresholdGiftSync";
import { zhtw } from "../../locales/zhTW";
import { useCartStore } from "../../store/cartStore";
import type { Product, Promotion } from "../../types/pos";
import type { PosBoothOutletContext } from "./PosBoothRoute";
import { BundleApplyModal } from "./BundleApplyModal";
import { CartPanel } from "./CartPanel";
import { PosTabletClockButtons } from "./PosTabletClockButtons";
import { ProductGrid } from "./ProductGrid";
import "./pos.css";

/** Tab key for products without `category_id`. */
const UNCATEGORIZED_TAB_KEY = "__uncategorized__";

function categoryTabKey(p: Product): string {
  return p.categoryId ?? UNCATEGORIZED_TAB_KEY;
}

function categoryTabLabel(p: Product, uncategorized: string): string {
  const n = p.categoryName?.trim();
  return n || uncategorized;
}

/** Unique categories from catalog; stable key, sorted by admin `categories.sort_order` (uncategorized last). */
function categoryTabsFromProducts(
  products: Product[],
  uncategorizedLabel: string,
): { key: string; label: string }[] {
  const byKey = new Map<string, { label: string; sort: number }>();
  for (const p of products) {
    const key = categoryTabKey(p);
    if (!byKey.has(key)) {
      byKey.set(key, {
        label: categoryTabLabel(p, uncategorizedLabel),
        sort: p.categorySortOrder,
      });
    }
  }
  return [...byKey.entries()]
    .sort(([ka, a], [kb, b]) => {
      if (ka === UNCATEGORIZED_TAB_KEY) return 1;
      if (kb === UNCATEGORIZED_TAB_KEY) return -1;
      if (a.sort !== b.sort) return a.sort - b.sort;
      return a.label.localeCompare(b.label, "zh-Hant");
    })
    .map(([key, v]) => ({ key, label: v.label }));
}

export function PosLayout() {
  return (
    <PosCashierProvider>
      <PosLayoutInner />
    </PosCashierProvider>
  );
}

function PosLayoutInner() {
  const { boothId } = useParams<{ boothId: string }>();
  const navigate = useNavigate();
  const { entry } = useOutletContext<PosBoothOutletContext>();
  const addProduct = useCartStore((s) => s.addProduct);
  const addBundleLines = useCartStore((s) => s.addBundleLines);

  const boothLabel = entry.location ? `${entry.name} · ${entry.location}` : entry.name;

  const [products, setProducts] = useState<Product[]>([]);
  const [bundleModalProduct, setBundleModalProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<string>("");
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [promotionsError, setPromotionsError] = useState<string | null>(null);
  const [scheduledStaffNames, setScheduledStaffNames] = useState<string[]>([]);
  const [activeStaffNames, setActiveStaffNames] = useState<string[]>([]);
  const [staffRefreshToken, setStaffRefreshToken] = useState(0);

  useEffect(() => {
    if (!boothId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [scheduled, active] = await Promise.all([
          fetchScheduledStaffNamesForBooth(boothId),
          fetchActiveStaffNamesForBooth(boothId),
        ]);
        if (cancelled) return;
        setScheduledStaffNames(scheduled);
        setActiveStaffNames(active);
      } catch {
        if (cancelled) return;
        setScheduledStaffNames([]);
        setActiveStaffNames([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boothId, staffRefreshToken]);

  usePruneManualPromotionGroups(promotions, products);
  useManualFreeLineSync(promotions, products);
  useThresholdGiftSync(promotions);

  const tabItems = useMemo(
    () => categoryTabsFromProducts(products, zhtw.pos.uncategorized),
    [products],
  );

  const categoryKeySet = useMemo(() => new Set(tabItems.map((t) => t.key)), [tabItems]);

  const displayTab = useMemo(() => {
    if (activeTab && categoryKeySet.has(activeTab)) return activeTab;
    return tabItems[0]?.key ?? "";
  }, [activeTab, categoryKeySet, tabItems]);

  const gridProducts = useMemo(() => {
    if (!displayTab) return [];
    const list = products.filter((p) => categoryTabKey(p) === displayTab);
    return [...list].sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-Hant"),
    );
  }, [products, displayTab]);

  const standardProductsForBundle = useMemo(
    () => products.filter((p) => p.kind === "STANDARD"),
    [products],
  );
  const scheduledStaffText = scheduledStaffNames.length > 0 ? scheduledStaffNames.join("、") : zhtw.common.dash;
  const activeStaffText = activeStaffNames.length > 0 ? activeStaffNames.join("、") : zhtw.common.dash;

  const handleAddProduct = (p: Product) => {
    if (p.kind === "CUSTOM_BUNDLE") {
      if (p.stock <= 0) return;
      const groups = p.bundleGroups ?? [];
      if (
        groups.length < 1 ||
        !groups.every((g) => g.requiredQty >= 1 && g.productIds.length > 0)
      ) {
        return;
      }
      setBundleModalProduct(p);
      return;
    }
    addProduct(p);
  };

  useEffect(() => {
    let cancelled = false;

    function errMessage(e: unknown): string {
      return e instanceof Error ? e.message : zhtw.common.requestFailed;
    }

    async function load() {
      if (!boothId) return;

      setProductsLoading(true);
      setProductsError(null);
      setPromotionsError(null);

      const [pRes, prRes] = await Promise.allSettled([
        fetchProductsForPosBooth(boothId),
        fetchPromotions(boothId),
      ]);

      if (cancelled) return;

      if (pRes.status === "fulfilled") {
        setProducts(pRes.value);
        setProductsError(null);
      } else {
        setProducts([]);
        setProductsError(errMessage(pRes.reason));
      }

      if (prRes.status === "fulfilled") {
        setPromotions(prRes.value);
        setPromotionsError(null);
      } else {
        setPromotions([]);
        setPromotionsError(errMessage(prRes.reason));
      }

      setProductsLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [boothId]);

  if (!boothId) {
    return (
      <div
        className="pos-layout"
        style={{
          gridTemplateColumns: "1fr",
          placeItems: "center",
          padding: "2rem",
        }}>
        <Typography.Text type="danger">{zhtw.pos.boothInvalidHint}</Typography.Text>
        <Link className="pos-admin-link" to="/">
          {zhtw.pos.boothPickerBack}
        </Link>
      </div>
    );
  }

  return (
    <div className="pos-layout">
      <main className="pos-main">
        <header className="pos-main__header">
          <div className="pos-main__title-row">
            <h1>{zhtw.pos.registerTitle}</h1>
            {boothId ? (
              <Space wrap size={8} align="center" className="pos-header-actions">
                <PosTabletClockButtons
                  boothId={boothId}
                  onClockRecordsChanged={() =>
                    setStaffRefreshToken((prev) => prev + 1)
                  }
                />
                <Button
                  type="default"
                  size="small"
                  icon={<Home size={16} strokeWidth={2} aria-hidden />}
                  aria-label={zhtw.pos.cashierBoothHomeAria}
                  onClick={() => navigate(`/pos/${boothId}`)}>
                  {zhtw.pos.cashierBoothHomeLabel}
                </Button>
              </Space>
            ) : null}
          </div>
          {boothLabel ? (
            <div className="pos-main__meta-row">
              <span className="pos-main__meta-booth">{zhtw.pos.currentBooth(boothLabel)}</span>
              <span className="pos-main__meta-sep">|</span>
              <span className="pos-main__meta-item">
                <span className="pos-main__meta-label">排班人員：</span>
                <span className="pos-main__meta-value">{scheduledStaffText}</span>
              </span>
              <span className="pos-main__meta-sep">|</span>
              <span className="pos-main__meta-item">
                <span className="pos-main__meta-label">在班人員：</span>
                <span className="pos-main__meta-value pos-main__meta-value--active">{activeStaffText}</span>
              </span>
            </div>
          ) : null}
        </header>
        <div className="pos-main__catalog">
          {!productsLoading && !productsError && tabItems.length > 0 ? (
            <div
              className="pos-category-bar"
              role="tablist"
              aria-label={zhtw.pos.categoryBarAria}
            >
              {tabItems.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={displayTab === t.key}
                  className={`pos-category-btn${displayTab === t.key ? " active" : ""}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="pos-product-area">
            <ProductGrid
              products={gridProducts}
              loading={productsLoading}
              error={productsError}
              onAddProduct={handleAddProduct}
              emptyMessage={
                products.length === 0 ? zhtw.pos.emptyCatalog : zhtw.pos.emptyCategory
              }
            />
          </div>
        </div>
      </main>
      <CartPanel
        boothId={boothId ?? ""}
        promotions={promotions}
        products={products}
        promotionsError={promotionsError}
      />
      <BundleApplyModal
        open={bundleModalProduct != null}
        bundleProduct={bundleModalProduct}
        catalogProducts={standardProductsForBundle}
        onClose={() => setBundleModalProduct(null)}
        onConfirm={(newLines) => {
          addBundleLines(newLines);
          setBundleModalProduct(null);
        }}
      />
    </div>
  );
}
