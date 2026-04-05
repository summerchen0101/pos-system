import { App as AntdApp, ConfigProvider, theme } from "antd";
import zhTW from "antd/locale/zh_TW";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PosLayout } from "./components/pos/PosLayout";
import { AdminLayout } from "./layouts/AdminLayout";
import { AdminBoothsPage } from "./pages/AdminBoothsPage";
import { AdminCategoriesPage } from "./pages/AdminCategoriesPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminOrdersPage } from "./pages/AdminOrdersPage";
import { AdminProductsPage } from "./pages/AdminProductsPage";
import { AdminGiftsPage } from "./pages/AdminGiftsPage";
import { AdminPromotionsPage } from "./pages/AdminPromotionsPage";
import { PosBoothPickerPage } from "./pages/PosBoothPickerPage";

const appTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: "#4f8fff",
    colorSuccess: "#73d13d",
    colorWarning: "#d89614",
    colorError: "#ff7875",
    colorBgBase: "#0a0a0a",
    colorBgLayout: "#0a0a0a",
    colorBgContainer: "#1f1f1f",
    colorText: "rgba(255, 255, 255, 0.92)",
    colorTextSecondary: "rgba(255, 255, 255, 0.55)",
    colorTextTertiary: "rgba(255, 255, 255, 0.45)",
    colorBorder: "#424242",
    colorSplit: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    fontSize: 14,
  },
  components: {
    Layout: {
      bodyBg: "#0a0a0a",
      headerBg: "#141414",
      headerColor: "rgba(255, 255, 255, 0.88)",
      siderBg: "#111111",
    },
    Menu: {
      itemSelectedBg: "rgba(79, 143, 255, 0.18)",
      itemHoverBg: "rgba(255, 255, 255, 0.06)",
    },
    Card: {
      colorBgContainer: "#1a1a1a",
    },
    Table: {
      headerBg: "#1a1a1a",
      rowHoverBg: "rgba(255, 255, 255, 0.04)",
    },
  },
};

export default function App() {
  return (
    <ConfigProvider locale={zhTW} theme={appTheme}>
      <AntdApp>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PosBoothPickerPage />} />
            <Route path="/pos/:boothId" element={<PosLayout />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route
                index
                element={<Navigate to="/admin/dashboard" replace />}
              />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="booths" element={<AdminBoothsPage />} />
              <Route path="categories" element={<AdminCategoriesPage />} />
              <Route path="products" element={<AdminProductsPage />} />
              <Route path="gifts" element={<AdminGiftsPage />} />
              <Route path="promotions" element={<AdminPromotionsPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}
