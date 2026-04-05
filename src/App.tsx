import { App as AntdApp, ConfigProvider, theme } from 'antd'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PosLayout } from './components/pos/PosLayout'
import { AdminLayout } from './layouts/AdminLayout'
import { AdminCategoriesPage } from './pages/AdminCategoriesPage'
import { AdminOrdersPage } from './pages/AdminOrdersPage'
import { AdminProductsPage } from './pages/AdminProductsPage'
import { AdminPromotionsPage } from './pages/AdminPromotionsPage'

export default function App() {
  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <AntdApp>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PosLayout />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/products" replace />} />
              <Route path="categories" element={<AdminCategoriesPage />} />
              <Route path="products" element={<AdminProductsPage />} />
              <Route path="promotions" element={<AdminPromotionsPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  )
}
