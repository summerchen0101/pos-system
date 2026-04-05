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

/** POS register: filter products by pack size (order = default tab order). */
const POS_SIZE_TAB_LABELS = ["小包", "中包"] as const;

const SIZE_TAB_KEYS = new Set<string>(POS_SIZE_TAB_LABELS);

function normalizeSize(size: string | null | undefined): string {
  return size?.trim() ?? "";
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
    () => POS_SIZE_TAB_LABELS.map((label) => ({ key: label, label })),
    [],
  );

  const displayTab = useMemo(() => {
    if (activeTab && SIZE_TAB_KEYS.has(activeTab)) return activeTab;
    return POS_SIZE_TAB_LABELS[0];
  }, [activeTab]);

  const gridProducts = useMemo(() => {
    return products.filter((p) => normalizeSize(p.size) === displayTab);
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
        {!productsLoading && !productsError ? (
          <Tabs
            className="pos-size-tabs"
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
          emptyMessage={zhtw.pos.emptySize}
        />
      </main>
      <CartPanel promotions={promotions} products={products} promotionsError={promotionsError} />
    </div>
  );
}
