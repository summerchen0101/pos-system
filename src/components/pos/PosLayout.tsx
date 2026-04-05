import { Tabs } from "antd";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchProducts } from "../../api/fetchProducts";
import { fetchPromotions } from "../../api/fetchPromotions";
import { useManualFreeLineSync } from "../../hooks/useManualFreeLineSync";
import { useThresholdGiftSync } from "../../hooks/useThresholdGiftSync";
import { zhtw } from "../../locales/zhTW";
import { useCartStore } from "../../store/cartStore";
import type { Product, Promotion } from "../../types/pos";
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
  const addProduct = useCartStore((s) => s.addProduct);

  const [products, setProducts] = useState<Product[]>([]);
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

  const categoryKeySet = useMemo(() => new Set(tabItems.map((t) => t.key)), [tabItems]);

  const displayTab = useMemo(() => {
    if (activeTab && categoryKeySet.has(activeTab)) return activeTab;
    return tabItems[0]?.key ?? "";
  }, [activeTab, categoryKeySet, tabItems]);

  const gridProducts = useMemo(() => {
    if (!displayTab) return [];
    return products.filter((p) => categoryTabKey(p) === displayTab);
  }, [products, displayTab]);

  useEffect(() => {
    let cancelled = false;

    function errMessage(e: unknown): string {
      return e instanceof Error ? e.message : zhtw.common.requestFailed;
    }

    async function load() {
      setProductsLoading(true);
      setProductsError(null);
      setPromotionsError(null);

      const [pRes, prRes] = await Promise.allSettled([
        fetchProducts(),
        fetchPromotions(),
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
  }, []);

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
          <p className="pos-main__hint">{zhtw.pos.hint}</p>
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
          onAddProduct={addProduct}
          emptyMessage={
            products.length === 0 ? zhtw.pos.emptyCatalog : zhtw.pos.emptyCategory
          }
        />
      </main>
      <CartPanel promotions={promotions} products={products} promotionsError={promotionsError} />
    </div>
  );
}
