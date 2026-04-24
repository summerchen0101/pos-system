/** Tab key for products without `category_id`. */
export const UNCATEGORIZED_TAB_KEY = '__uncategorized__'

export function categoryTabKey(categoryId: string | null | undefined): string {
  return categoryId ?? UNCATEGORIZED_TAB_KEY
}

export function categoryTabLabel(categoryName: string | null | undefined, uncategorized: string): string {
  const n = categoryName?.trim()
  return n || uncategorized
}

export type PosCategoryTabSource = {
  categoryId: string | null
  categoryName: string | null
  categorySortOrder: number
}

/** Unique categories; stable key, sorted by admin `categories.sort_order` (uncategorized last). */
export function buildCategoryTabs(
  entries: Iterable<PosCategoryTabSource>,
  uncategorizedLabel: string,
): { key: string; label: string }[] {
  const byKey = new Map<string, { label: string; sort: number }>()
  for (const p of entries) {
    const key = categoryTabKey(p.categoryId)
    if (!byKey.has(key)) {
      byKey.set(key, {
        label: categoryTabLabel(p.categoryName, uncategorizedLabel),
        sort: p.categorySortOrder,
      })
    }
  }
  return [...byKey.entries()]
    .sort(([ka, a], [kb, b]) => {
      if (ka === UNCATEGORIZED_TAB_KEY) return 1
      if (kb === UNCATEGORIZED_TAB_KEY) return -1
      if (a.sort !== b.sort) return a.sort - b.sort
      return a.label.localeCompare(b.label, 'zh-Hant')
    })
    .map(([key, v]) => ({ key, label: v.label }))
}
