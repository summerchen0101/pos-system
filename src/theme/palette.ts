/**
 * 全站視覺主色與語意色（非 Ant Design `token` 的來源：inline style、Tag 自訂色、`--pos-*` CSS 變數）。
 *
 * 調整 POS / 後台整體配色時，主要改這裡即可；並請讓 `appAntdTheme` 與本檔主色一致。
 */
export const palette = {
  /** 主色（金）— 對應 Ant `colorPrimary` */
  accent: "#c8a96e",
  accentHover: "#d4b87e",
  accentActive: "#b8955a",
  accentSoft: "rgba(200, 169, 110, 0.16)",
  accentWash08: "rgba(200, 169, 110, 0.08)",
  accentFocusRing: "rgba(200, 169, 110, 0.33)",
  /** 主色按鈕／標籤上的文字 */
  accentOnAccent: "#1a1814",

  pageBg: "#0e0d0c",
  surface: "#1e1d1b",
  surface2: "#252320",
  cartBg: "#161513",
  categoryBarBg: "#161513",
  border: "#3a3730",

  text: "#f5f0e8",
  textSecondary: "#a09890",
  textMuted: "#7a7770",
  textFaint: "#4a4845",

  success: "#7aad5a",
  danger: "#c45a4a",
  dangerSoft: "rgba(196, 90, 74, 0.18)",

  shadowSm: "0 1px 3px rgba(0, 0, 0, 0.45)",

  /**
   * Ant Design `Tag` 的 `color`：可填 preset 名稱或 hex。
   * 以下取代原先的 blue / geekblue 主色感。
   */
  tagAccent: "#c8a96e",
  tagAccentMuted: "#9d8b62",
  tagBundle: "#9d8b62",
  tagGift: "#c8a96e",
  tagRoleAdmin: "#c8a96e",
  tagSwapAccepted: "#c8a96e",
} as const;

export type PaletteKey = keyof typeof palette;

/** 寫入 `document.documentElement`，供 `var(--pos-*)` 使用（見 index.css / pos.css）。 */
export function applyPaletteCssVars(el: HTMLElement = document.documentElement): void {
  const map: Record<string, string> = {
    "--pos-page-bg": palette.pageBg,
    "--pos-text-strong": palette.text,
    "--pos-text-muted": palette.textMuted,
    "--pos-text-faint": palette.textFaint,
    "--pos-text-secondary": palette.textSecondary,
    "--pos-border": palette.border,
    "--pos-surface": palette.surface,
    "--pos-cart-bg": palette.cartBg,
    "--pos-accent": palette.accent,
    "--pos-accent-soft": palette.accentSoft,
    "--pos-accent-wash-08": palette.accentWash08,
    "--pos-accent-on-accent": palette.accentOnAccent,
    "--pos-success": palette.success,
    "--pos-danger": palette.danger,
    "--pos-danger-soft": palette.dangerSoft,
    "--pos-shadow-sm": palette.shadowSm,
  };
  for (const [k, v] of Object.entries(map)) {
    el.style.setProperty(k, v);
  }
}
