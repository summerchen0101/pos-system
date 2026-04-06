import { Spin, Tabs, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listBoothsAdmin } from "../../api/boothsAdmin";
import { fetchProducts } from "../../api/fetchProducts";
import { fetchPromotions } from "../../api/fetchPromotions";
import { useManualFreeLineSync } from "../../hooks/useManualFreeLineSync";
import { useThresholdGiftSync } from "../../hooks/useThresholdGiftSync";
import { zhtw } from "../../locales/zhTW";
import { useCartStore } from "../../store/cartStore";
import type { Product, Promotion } from "../../types/pos";
import { BundleApplyModal } from "./BundleApplyModal";
import { ProductGrid } from "./ProductGrid";
import { CartPanel } from "./CartPanel";
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

/** Unique categories from catalog; stable key, sorted label (uncategorized last). */
function categoryTabsFromProducts(
  products: Product[],
  uncategorizedLabel: string,
): { key: string; label: string }[] {
  const byKey = new Map<string, string>();
  for (const p of products) {
    const key = categoryTabKey(p);
    if (!byKey.has(key)) {
      byKey.set(key, categoryTabLabel(p, uncategorizedLabel));
    }
  }
  return [...byKey.entries()]
    .sort(([ka, la], [kb, lb]) => {
      if (ka === UNCATEGORIZED_TAB_KEY) return 1;
      if (kb === UNCATEGORIZED_TAB_KEY) return -1;
      return la.localeCompare(lb, "zh-Hant");
    })
    .map(([key, label]) => ({ key, label }));
}

export function PosLayout() {
  const { boothId } = useParams<{ boothId: string }>();
  const addProduct = useCartStore((s) => s.addProduct);
  const addBundleLines = useCartStore((s) => s.addBundleLines);

  const [boothOk, setBoothOk] = useState<boolean | null>(null);
  const [boothLabel, setBoothLabel] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [bundleModalProduct, setBundleModalProduct] = useState<Product | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<string>("");
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [promotionsError, setPromotionsError] = useState<string | null>(null);

  useManualFreeLineSync(promotions, products);
  useThresholdGiftSync(promotions);

  const tabItems = useMemo(
    () => categoryTabsFromProducts(products, zhtw.pos.uncategorized),
    [products],
  );

  const categoryKeySet = useMemo(
    () => new Set(tabItems.map((t) => t.key)),
    [tabItems],
  );

  const displayTab = useMemo(() => {
    if (activeTab && categoryKeySet.has(activeTab)) return activeTab;
    return tabItems[0]?.key ?? "";
  }, [activeTab, categoryKeySet, tabItems]);

  const gridProducts = useMemo(() => {
    if (!displayTab) return [];
    return products.filter((p) => categoryTabKey(p) === displayTab);
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
      if (!boothId) {
        setBoothOk(false);
        setProductsLoading(false);
        return;
      }

      setProductsLoading(true);
      setProductsError(null);
      setPromotionsError(null);
      setBoothOk(null);

      try {
        const booths = await listBoothsAdmin();
        if (cancelled) return;
        const b = booths.find((x) => x.id === boothId);
        if (!b) {
          setBoothOk(false);
          setBoothLabel("");
          setProducts([]);
          setPromotions([]);
          setProductsLoading(false);
          return;
        }
        setBoothOk(true);
        setBoothLabel(b.location ? `${b.name} · ${b.location}` : b.name);
      } catch {
        if (cancelled) return;
        setBoothOk(false);
        setBoothLabel("");
        setProducts([]);
        setPromotions([]);
        setProductsLoading(false);
        return;
      }

      const [pRes, prRes] = await Promise.allSettled([
        fetchProducts(),
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

  if (boothOk === false) {
    return (
      <div
        className="pos-layout"
        style={{
          gridTemplateColumns: "1fr",
          placeItems: "center",
          padding: "2rem",
        }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <Typography.Title
            level={4}
            style={{ color: "var(--pos-text-strong)" }}>
            {zhtw.pos.boothInvalidTitle}
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            {zhtw.pos.boothInvalidHint}
          </Typography.Paragraph>
          <Link className="pos-admin-link" to="/">
            {zhtw.pos.boothPickerBack}
          </Link>
        </div>
      </div>
    );
  }

  if (boothOk === null && boothId) {
    return (
      <div
        className="pos-layout"
        style={{ gridTemplateColumns: "1fr", placeItems: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="pos-layout">
      <main className="pos-main">
        <header className="pos-main__header">
          <div className="pos-main__title-row">
            <h1>{zhtw.pos.registerTitle}</h1>
            <Link className="pos-admin-link" to="/admin">
              {zhtw.pos.adminLink}
            </Link>
          </div>
          {boothLabel ? (
            <p className="pos-main__hint" style={{ marginBottom: 4 }}>
              {zhtw.pos.currentBooth(boothLabel)}
            </p>
          ) : null}
          <p
            className="pos-main__hint"
            style={boothLabel ? { marginTop: 0 } : undefined}>
            {zhtw.pos.hint}
          </p>
        </header>
        {!productsLoading && !productsError && tabItems.length > 0 ? (
          <Tabs
            className="pos-category-tabs"
            activeKey={displayTab}
            onChange={setActiveTab}
            items={tabItems}
          />
        ) : null}
        <ProductGrid
          products={gridProducts}
          loading={productsLoading}
          error={productsError}
          onAddProduct={handleAddProduct}
          emptyMessage={
            products.length === 0
              ? zhtw.pos.emptyCatalog
              : zhtw.pos.emptyCategory
          }
        />
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
