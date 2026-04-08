import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import zhTW from "antd/locale/zh_TW";
import dayjs from "dayjs";
import "dayjs/locale/zh-tw";
import "./index.css";
import App from "./App.tsx";
import { appAntdTheme } from "./appAntdTheme";
import { applyPaletteCssVars } from "./theme/palette";

dayjs.locale("zh-tw");
applyPaletteCssVars();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider locale={zhTW} theme={appAntdTheme}>
      <App />
    </ConfigProvider>
  </StrictMode>,
);
