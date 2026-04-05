import { AppstoreOutlined, GiftOutlined, HistoryOutlined, ShoppingOutlined } from '@ant-design/icons'
import { Layout, Menu, Typography } from 'antd'
import { useMemo } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'

const { Header, Sider, Content } = Layout
const { Text } = Typography

const MENU = [
  { key: '/admin/categories', icon: <AppstoreOutlined />, label: 'Category Management' },
  { key: '/admin/products', icon: <ShoppingOutlined />, label: 'Product Management' },
  { key: '/admin/promotions', icon: <GiftOutlined />, label: 'Promotion Management' },
  { key: '/admin/orders', icon: <HistoryOutlined />, label: 'Order History' },
]

export function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()

  const selectedKeys = useMemo(() => {
    const match = MENU.find((m) => location.pathname.startsWith(m.key))
    return match ? [match.key] : ['/admin/products']
  }, [location.pathname])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth={0} theme="light" width={240}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
          <Text strong style={{ fontSize: 15 }}>
            Admin
          </Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          items={MENU}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Link to="/">← Back to Register</Link>
        </Header>
        <Content style={{ margin: 0, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
