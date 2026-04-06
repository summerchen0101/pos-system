import { App as AntdApp, ConfigProvider, theme } from "antd";
import zhTW from "antd/locale/zh_TW";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { defaultAdminHomePath } from "./api/authProfile";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { PosLayout } from "./components/pos/PosLayout";
import { AdminLayout } from "./layouts/AdminLayout";
import { AdminBoothsPage } from "./pages/AdminBoothsPage";
import { AdminCategoriesPage } from "./pages/AdminCategoriesPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminOrdersPage } from "./pages/AdminOrdersPage";
import { AdminProductsPage } from "./pages/AdminProductsPage";
import { AdminGiftsPage } from "./pages/AdminGiftsPage";
import { AdminPromotionsPage } from "./pages/AdminPromotionsPage";
import { LoginPage } from "./pages/LoginPage";
import { PosBoothPickerPage } from "./pages/PosBoothPickerPage";
import { AdminClockLogsPage } from "./pages/AdminClockLogsPage";
import { AdminShiftsPage } from "./pages/AdminShiftsPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { MyClockLogsPage } from "./pages/MyClockLogsPage";
import { MyShiftsPage } from "./pages/MyShiftsPage";

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

function AdminIndexRedirect() {
  const { profile } = useAuth();
  if (!profile) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={defaultAdminHomePath(profile.role)} replace />;
}

export default function App() {
  return (
    <ConfigProvider locale={zhTW} theme={appTheme}>
      <AntdApp>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<PosBoothPickerPage />} />
              <Route path="/pos/:boothId" element={<PosLayout />} />
              <Route
                path="/admin"
                element={
                  <RequireAuth>
                    <AdminLayout />
                  </RequireAuth>
                }>
                <Route index element={<AdminIndexRedirect />} />
                <Route path="dashboard" element={<AdminDashboardPage />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="booths" element={<AdminBoothsPage />} />
                <Route path="categories" element={<AdminCategoriesPage />} />
                <Route path="products" element={<AdminProductsPage />} />
                <Route path="gifts" element={<AdminGiftsPage />} />
                <Route path="promotions" element={<AdminPromotionsPage />} />
                <Route path="my-shifts" element={<MyShiftsPage />} />
                <Route path="my-clock-logs" element={<MyClockLogsPage />} />
                <Route path="shifts" element={<AdminShiftsPage />} />
                <Route path="clock-logs" element={<AdminClockLogsPage />} />
                <Route path="orders" element={<AdminOrdersPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}
