import { theme } from "antd";
import { palette } from "./theme/palette";

/** Dark algorithm；主色與 `palette.accent` 同源（main.tsx `ConfigProvider`）。 */
export const appAntdTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: palette.accent,
    colorPrimaryHover: palette.accentHover,
    colorPrimaryActive: palette.accentActive,
    /** Table 展開鈕等使用 `operationUnit`，預設跟 link 色＝藍；改為與主色一致。 */
    colorLink: palette.accent,
    colorLinkHover: palette.accentHover,
    colorLinkActive: palette.accentActive,
    /** 後台 `AdminLayout` 右側主區與 `Layout` 元件 body */
    colorBgLayout: palette.adminLayoutContentBg,
  },
  components: {
    Layout: {
      siderBg: palette.cartBg,
      triggerBg: palette.surface,
    },
    Menu: {
      darkItemBg: palette.cartBg,
      darkSubMenuItemBg: palette.adminMenuDarkSubItemBg,
      darkItemSelectedBg: palette.adminMenuDarkItemSelectedBg,
      darkItemSelectedColor: palette.accent,
      darkItemHoverBg: palette.surface,
      darkItemHoverColor: palette.accent,
      darkItemColor: palette.textSecondary,
      darkGroupTitleColor: palette.textFaint,
    },
  },
};
