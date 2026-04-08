import { Button, Space, Typography } from "antd";
import { Maximize, Minimize } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { fetchActiveStaffNamesForBooth, formatPosActiveStaffLine } from "../../api/posActiveStaff";
import { fetchProductsForPosBooth } from "../../api/fetchProducts";
import { fetchPromotions } from "../../api/fetchPromotions";
import { PosCashierProvider } from "../../context/PosCashierContext";
import { useManualFreeLineSync } from "../../hooks/useManualFreeLineSync";
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

function getFullscreenElement(): Element | null {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

/** Best-effort fullscreen (must run from a user gesture on most browsers). */
function requestDocumentFullscreen(): void {
  const el = document.documentElement;
  const hel = el as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (typeof el.requestFullscreen === "function") {
    void el.requestFullscreen().catch(() => {});
  } else if (typeof hel.webkitRequestFullscreen === "function") {
    hel.webkitRequestFullscreen();
  }
}

function exitDocumentFullscreen(): void {
  const doc = document as Document & { webkitExitFullscreen?: () => void };
  if (typeof document.exitFullscreen === "function") {
    void document.exitFullscreen().catch(() => {});
  } else if (typeof doc.webkitExitFullscreen === "function") {
    doc.webkitExitFullscreen();
  }
}

function toggleDocumentFullscreen(): void {
  if (!getFullscreenElement()) requestDocumentFullscreen();
  else exitDocumentFullscreen();
}

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
  const [activeStaffLine, setActiveStaffLine] = useState(
    () => `${zhtw.pos.activeStaffPrefix}${zhtw.common.dash}`,
  );
  const [fullscreenActive, setFullscreenActive] = useState(
    () => getFullscreenElement() != null,
  );

  useEffect(() => {
    const sync = () => setFullscreenActive(getFullscreenElement() != null);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener(
      "webkitfullscreenchange",
      sync as EventListener,
    );
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener(
        "webkitfullscreenchange",
        sync as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    const onFirstClick = () => requestDocumentFullscreen();
    document.addEventListener("click", onFirstClick, { once: true });
    return () => document.removeEventListener("click", onFirstClick);
  }, []);

  const refreshActiveStaff = useCallback(async () => {
    if (!boothId) return;
    try {
      const names = await fetchActiveStaffNamesForBooth(boothId);
      setActiveStaffLine(
        formatPosActiveStaffLine(
          names,
          zhtw.pos.activeStaffPrefix,
          zhtw.common.dash,
          zhtw.pos.activeStaffTotal,
        ),
      );
    } catch {
      setActiveStaffLine(
        `${zhtw.pos.activeStaffPrefix}${zhtw.common.dash}`,
      );
    }
  }, [boothId]);

  useEffect(() => {
    if (!boothId) return;
    void refreshActiveStaff();
  }, [boothId, refreshActiveStaff]);

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
            <Space wrap size={12} align="center">
              <Button
                type="text"
                className="pos-fullscreen-toggle"
                aria-pressed={fullscreenActive}
                aria-label={
                  fullscreenActive
                    ? zhtw.pos.fullscreenExitAria
                    : zhtw.pos.fullscreenEnterAria
                }
                icon={
                  fullscreenActive ? (
                    <Minimize size={20} aria-hidden />
                  ) : (
                    <Maximize size={20} aria-hidden />
                  )
                }
                onClick={() => toggleDocumentFullscreen()}
              />
              {boothId ? (
                <div className="pos-header-clock">
                  <PosTabletClockButtons boothId={boothId} onClockRecordsChanged={refreshActiveStaff} />
                </div>
              ) : null}
            </Space>
          </div>
          {boothLabel ? (
            <p className="pos-main__hint" style={{ marginBottom: 4 }}>
              {zhtw.pos.currentBooth(boothLabel)}
            </p>
          ) : null}
          {boothId ? (
            <div className="pos-main__active-staff-wrap">
              <p className="pos-main__active-staff">{activeStaffLine}</p>
            </div>
          ) : null}
          <p className="pos-main__hint" style={boothLabel ? { marginTop: 0 } : undefined}>
            {zhtw.pos.hint}
          </p>
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
