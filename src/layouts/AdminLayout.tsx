import {
  AppstoreOutlined,
  DashboardOutlined,
  GiftOutlined,
  HistoryOutlined,
  ShopOutlined,
  ShoppingOutlined,
  SkinOutlined,
} from '@ant-design/icons'
import { Layout, Menu, Typography, theme } from 'antd'
import { useMemo } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { zhtw } from '../locales/zhTW'

const { Header, Sider, Content } = Layout
const { Text } = Typography

export function AdminLayout() {
  const { token } = theme.useToken()
  const location = useLocation()
  const navigate = useNavigate()

  const menuItems = useMemo(
    () => [
      { key: '/admin/dashboard', icon: <DashboardOutlined />, label: zhtw.admin.layout.menuDashboard },
      { key: '/admin/booths', icon: <ShopOutlined />, label: zhtw.admin.layout.menuBooths },
      { key: '/admin/categories', icon: <AppstoreOutlined />, label: zhtw.admin.layout.menuCategories },
      { key: '/admin/products', icon: <ShoppingOutlined />, label: zhtw.admin.layout.menuProducts },
      { key: '/admin/gifts', icon: <SkinOutlined />, label: zhtw.admin.layout.menuGifts },
      { key: '/admin/promotions', icon: <GiftOutlined />, label: zhtw.admin.layout.menuPromotions },
      { key: '/admin/orders', icon: <HistoryOutlined />, label: zhtw.admin.layout.menuOrders },
    ],
    [],
  )

  const selectedKeys = useMemo(() => {
    const match = menuItems.find((m) => location.pathname.startsWith(m.key))
    return match ? [match.key] : ['/admin/dashboard']
  }, [location.pathname, menuItems])

  return (
    <Layout style={{ minHeight: '100vh', background: token.colorBgLayout }}>
      <Sider breakpoint="lg" collapsedWidth={0} width={240}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${token.colorSplit}`,
          }}
        >
          <Text strong style={{ fontSize: 15, color: token.colorText }}>
            {zhtw.admin.layout.title}
          </Text>
        </div>
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={selectedKeys}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, background: 'transparent' }}
        />
      </Sider>
      <Layout style={{ background: token.colorBgLayout }}>
        <Header
          style={{
            background: token.colorBgContainer,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            borderBottom: `1px solid ${token.colorSplit}`,
          }}
        >
          <Link
            to="/"
            style={{ color: token.colorLink, fontWeight: 500 }}
          >
            {zhtw.admin.layout.backToPos}
          </Link>
        </Header>
        <Content style={{ margin: 0, minHeight: 280, background: token.colorBgLayout }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
