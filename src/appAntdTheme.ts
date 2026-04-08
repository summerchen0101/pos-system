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
  },
};
