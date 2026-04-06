import type { SelectProps } from "antd";
import type { Category, Product, ProductKind } from "../types/pos";

function formatProductLabel(p: Product): string {
  return `${p.name}${p.size?.trim() ? ` (${p.size.trim()})` : ""} · ${p.sku}`;
}

/** Ant Design grouped options: categories (all kinds) → 未分類；與一般商品相同分類與 sort_order。 */
export function buildProductSelectGroups(
  products: Product[],
  categories: Category[],
  kinds: ProductKind[],
  uncategorizedLabel: string,
  excludeIds: Set<string>,
): NonNullable<SelectProps["options"]> {
  const list = products.filter((p) => kinds.includes(p.kind) && !excludeIds.has(p.id));

  const byCat = new Map<string, Product[]>();
  for (const p of list) {
    const key = p.categoryId ?? "__uncategorized__";
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(p);
  }

  const catById = new Map(categories.map((c) => [c.id, c]));
  const categoryIdsOrdered = [...categories]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-Hant"))
    .map((c) => c.id);

  const sortWithin = (arr: Product[]) =>
    [...arr].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-Hant"),
    );

  const out: NonNullable<SelectProps["options"]> = [];

  for (const cid of categoryIdsOrdered) {
    const items = byCat.get(cid);
    if (!items?.length) continue;
    const cat = catById.get(cid);
    const title = cat?.name ?? items[0].categoryName ?? "—";
    out.push({
      label: <span className="product-select__group-heading">{title}</span>,
      options: sortWithin(items).map((p) => ({
        label: formatProductLabel(p),
        value: p.id,
      })),
    });
  }

  const orphanCatKeys = [...byCat.keys()].filter(
    (k) => k !== "__uncategorized__" && !categoryIdsOrdered.includes(k),
  );
  orphanCatKeys.sort((a, b) => {
    const na = byCat.get(a)?.[0]?.categoryName ?? a;
    const nb = byCat.get(b)?.[0]?.categoryName ?? b;
    return na.localeCompare(nb, "zh-Hant");
  });
  for (const cid of orphanCatKeys) {
    const items = byCat.get(cid)!;
    out.push({
      label: (
        <span className="product-select__group-heading">
          {items[0].categoryName ?? cid}
        </span>
      ),
      options: sortWithin(items).map((p) => ({
        label: formatProductLabel(p),
        value: p.id,
      })),
    });
  }

  const unc = byCat.get("__uncategorized__");
  if (unc?.length) {
    out.push({
      label: <span className="product-select__group-heading">{uncategorizedLabel}</span>,
      options: sortWithin(unc).map((p) => ({
        label: formatProductLabel(p),
        value: p.id,
      })),
    });
  }

  return out;
}
