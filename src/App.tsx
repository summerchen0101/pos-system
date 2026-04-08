import { App as AntdApp } from "antd";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { defaultAdminHomePath } from "./api/authProfile";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { RequireAuth } from "./auth/RequireAuth";
import { PosBoothRoute } from "./components/pos/PosBoothRoute";
import { PosLayout } from "./components/pos/PosLayout";
import { AdminLayout } from "./layouts/AdminLayout";
import { AdminBoothsPage } from "./pages/AdminBoothsPage";
import { AdminCategoriesPage } from "./pages/AdminCategoriesPage";
import { AdminBuyerAnalyticsPage } from "./pages/AdminBuyerAnalyticsPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminInventoryLogsPage } from "./pages/AdminInventoryLogsPage";
import { AdminInventoryOverviewPage } from "./pages/AdminInventoryOverviewPage";
import { AdminOrdersPage } from "./pages/AdminOrdersPage";
import { AdminStocktakeDetailPage } from "./pages/AdminStocktakeDetailPage";
import { AdminStocktakesPage } from "./pages/AdminStocktakesPage";
import { AdminWarehousesPage } from "./pages/AdminWarehousesPage";
import { AdminProductsPage } from "./pages/AdminProductsPage";
import { AdminGiftsPage } from "./pages/AdminGiftsPage";
import { AdminPromotionsPage } from "./pages/AdminPromotionsPage";
import { LoginPage } from "./pages/LoginPage";
import { PosBoothHomePage } from "./pages/PosBoothHomePage";
import { PosHomePage } from "./pages/PosHomePage";
import { AdminClockLogsPage } from "./pages/AdminClockLogsPage";
import { AdminShiftsPage } from "./pages/AdminShiftsPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { MyClockLogsPage } from "./pages/MyClockLogsPage";
import { MyShiftsPage } from "./pages/MyShiftsPage";

function AdminIndexRedirect() {
  const { profile } = useAuth();
  if (!profile) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={defaultAdminHomePath(profile.role)} replace />;
}

export default function App() {
  return (
    <AntdApp>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<PosHomePage />} />
            <Route path="/pos/:boothId" element={<PosBoothRoute />}>
              <Route index element={<PosBoothHomePage />} />
              <Route path="cashier" element={<PosLayout />} />
            </Route>
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <AdminLayout />
                </RequireAuth>
              }>
              <Route index element={<AdminIndexRedirect />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="analytics" element={<AdminBuyerAnalyticsPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="booths" element={<AdminBoothsPage />} />
              <Route path="categories" element={<AdminCategoriesPage />} />
              <Route path="products" element={<AdminProductsPage />} />
              <Route path="inventory" element={<AdminInventoryOverviewPage />} />
              <Route path="inventory/warehouses" element={<AdminWarehousesPage />} />
              <Route path="inventory/stocktakes" element={<AdminStocktakesPage />} />
              <Route path="inventory/stocktakes/:stocktakeId" element={<AdminStocktakeDetailPage />} />
              <Route path="inventory/logs" element={<AdminInventoryLogsPage />} />
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
  );
}
