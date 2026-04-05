import { App as AntdApp, ConfigProvider, theme } from 'antd'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PosLayout } from './components/pos/PosLayout'
import { AdminPromotionsPage } from './pages/AdminPromotionsPage'

export default function App() {
  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <AntdApp>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PosLayout />} />
            <Route path="/admin/promotions" element={<AdminPromotionsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  )
}
