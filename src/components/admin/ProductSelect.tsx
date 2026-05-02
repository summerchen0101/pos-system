import { App, Select } from "antd";
import type { SelectProps } from "antd";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { listCategoriesAdmin } from "../../api/categoriesAdmin";
import { fetchAllProducts } from "../../api/fetchAllProducts";
import { buildProductSelectGroups } from "../../lib/productSelectGroups";
import { zhtw } from "../../locales/zhTW";
import type { Category, Product, ProductKind } from "../../types/pos";

const ps = zhtw.admin.productSelect;

export type ProductSelectProps = {
  value?: string | string[];
  onChange?: (value: string | string[] | undefined) => void;
  placeholder?: string;
  /** When `kinds` is not set: if true (default), include `CUSTOM_BUNDLE`. */
  includeBundle?: boolean;
  /** Overrides `includeBundle` when provided. */
  kinds?: ProductKind[];
  multiple?: boolean;
  allowClear?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: CSSProperties;
  className?: string;
  /** Admin catalog slice; skips product fetch when set (categories still load for group order). */
  products?: Product[];
  /** Exclude ids (e.g. bundle parent when picking components). */
  excludeProductIds?: string[];
};

export function ProductSelect({
  value,
  onChange,
  placeholder = ps.placeholder,
  includeBundle = true,
  kinds: kindsProp,
  multiple = false,
  allowClear = true,
  disabled,
  loading: loadingProp,
  style,
  className,
  products: productsProp,
  excludeProductIds,
}: ProductSelectProps) {
  const { message } = App.useApp();
  const [categories, setCategories] = useState<Category[]>([]);
  const [fetchedProducts, setFetchedProducts] = useState<Product[]>([]);
  const [fetchLoading, setFetchLoading] = useState(productsProp === undefined);

  const kinds = useMemo<ProductKind[]>(() => {
    if (kindsProp?.length) return [...kindsProp];
    return includeBundle ? ["STANDARD", "CUSTOM_BUNDLE"] : ["STANDARD"];
  }, [kindsProp, includeBundle]);

  const kindsKey = kinds.join(",");

  const excludeSet = useMemo(
    () => new Set((excludeProductIds ?? []).filter(Boolean)),
    [excludeProductIds],
  );

  const products = useMemo(
    () => (productsProp !== undefined ? productsProp : fetchedProducts),
    [productsProp, fetchedProducts],
  );

  useEffect(() => {
    let cancelled = false;
    void listCategoriesAdmin()
      .then((c) => {
        if (!cancelled) setCategories(c);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (productsProp !== undefined) {
      return;
    }
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setFetchLoading(true);
    });
    void fetchAllProducts({ kinds })
      .then((p) => {
        if (!cancelled) setFetchedProducts(p);
      })
      .catch((e) => {
        if (!cancelled) {
          message.error(e instanceof Error ? e.message : ps.loadError);
          setFetchedProducts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setFetchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productsProp, kindsKey, kinds, message]);

  const options = useMemo(
    () =>
      buildProductSelectGroups(
        products,
        categories,
        kinds,
        ps.uncategorized,
        excludeSet,
      ),
    [products, categories, kinds, excludeSet],
  );

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const filterOption: SelectProps["filterOption"] = (input, opt) => {
    const option = opt;
    const q = input.trim().toLowerCase();
    if (!q) return true;
    if (!option) return false;
    const ov = option.value;
    if (ov === undefined || ov === null) return false;
    const id = String(ov);
    const prod = productById.get(id);
    if (!prod)
      return String(option.label ?? "")
        .toLowerCase()
        .includes(q);
    const blob = [prod.name, prod.sku, prod.size ?? "", prod.nameEn ?? ""]
      .join(" ")
      .toLowerCase();
    if (blob.includes(q)) return true;
    if ((prod.categoryName ?? "").toLowerCase().includes(q)) return true;
    if (!prod.categoryId && ps.uncategorized.toLowerCase().includes(q))
      return true;
    return false;
  };

  const loading = loadingProp ?? (productsProp === undefined && fetchLoading);

  return (
    <Select
      className={
        className ? `admin-product-select ${className}` : "admin-product-select"
      }
      mode={multiple ? "multiple" : undefined}
      allowClear={allowClear}
      showSearch
      filterOption={filterOption}
      placeholder={placeholder}
      options={options}
      value={value}
      onChange={(v) => onChange?.(v as string | string[] | undefined)}
      disabled={disabled}
      loading={loading}
      style={style}
      notFoundContent={ps.empty}
      optionFilterProp="label"
    />
  );
}
