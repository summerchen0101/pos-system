import {
  AppstoreOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  GiftOutlined,
  HistoryOutlined,
  ScheduleOutlined,
  ShopOutlined,
  ShoppingOutlined,
  SkinOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Layout, Menu, Space, Typography, theme } from "antd";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  defaultAdminHomePath,
  isAdminRole,
  isManagerRole,
  type AppRole,
} from "../api/authProfile";
import { useAuth } from "../auth/AuthContext";
import { zhtw } from "../locales/zhTW";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

/** Sidebar paths in display order (ADMIN). */
const ADMIN_MENU_KEYS = new Set([
  "/admin/dashboard",
  "/admin/orders",
  "/admin/clock-logs",
  "/admin/categories",
  "/admin/products",
  "/admin/booths",
  "/admin/promotions",
  "/admin/gifts",
  "/admin/shifts",
  "/admin/users",
]);

const MANAGER_MENU_KEYS = new Set([
  "/admin/dashboard",
  "/admin/orders",
  "/admin/clock-logs",
  "/admin/shifts",
  "/admin/my-shifts",
  "/admin/my-clock-logs",
  "/admin/users",
]);

const STAFF_MENU_KEYS = new Set([
  "/admin/orders",
  "/admin/clock-logs",
  "/admin/my-shifts",
  "/admin/my-clock-logs",
]);

function menuKeysForRole(role: AppRole): Set<string> {
  if (isAdminRole(role)) return ADMIN_MENU_KEYS;
  if (isManagerRole(role)) return MANAGER_MENU_KEYS;
  return STAFF_MENU_KEYS;
}

function pathAllowedForRole(pathname: string, role: AppRole): boolean {
  const allowed = menuKeysForRole(role);
  return [...allowed].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

type MenuDef = { key: string; icon: ReactNode; label: string };

export function AdminLayout() {
  const { token } = theme.useToken();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const fullMenuItems: MenuDef[] = useMemo(
    () => [
      {
        key: "/admin/dashboard",
        icon: <DashboardOutlined />,
        label: zhtw.admin.layout.menuDashboard,
      },
      {
        key: "/admin/orders",
        icon: <HistoryOutlined />,
        label: zhtw.admin.layout.menuOrders,
      },
      {
        key: "/admin/clock-logs",
        icon: <ClockCircleOutlined />,
        label: zhtw.admin.layout.menuClockLogs,
      },
      {
        key: "/admin/categories",
        icon: <AppstoreOutlined />,
        label: zhtw.admin.layout.menuCategories,
      },
      {
        key: "/admin/products",
        icon: <ShoppingOutlined />,
        label: zhtw.admin.layout.menuProducts,
      },
      {
        key: "/admin/booths",
        icon: <ShopOutlined />,
        label: zhtw.admin.layout.menuBooths,
      },
      {
        key: "/admin/promotions",
        icon: <GiftOutlined />,
        label: zhtw.admin.layout.menuPromotions,
      },
      {
        key: "/admin/gifts",
        icon: <SkinOutlined />,
        label: zhtw.admin.layout.menuGifts,
      },
      {
        key: "/admin/shifts",
        icon: <ScheduleOutlined />,
        label: zhtw.admin.layout.menuShifts,
      },
      {
        key: "/admin/users",
        icon: <UserOutlined />,
        label: zhtw.admin.layout.menuUsers,
      },
      {
        key: "/admin/my-shifts",
        icon: <CalendarOutlined />,
        label: zhtw.admin.layout.menuMyShifts,
      },
      {
        key: "/admin/my-clock-logs",
        icon: <ClockCircleOutlined />,
        label: zhtw.admin.layout.menuMyClockLogs,
      },
    ],
    [],
  );

  const menuItems = useMemo(() => {
    if (!profile) return [];
    const allowed = menuKeysForRole(profile.role);
    return fullMenuItems.filter((m) => allowed.has(m.key));
  }, [fullMenuItems, profile]);

  const selectedKeys = useMemo(() => {
    const match = menuItems.find((m) => location.pathname.startsWith(m.key));
    return match
      ? [match.key]
      : menuItems.length > 0
        ? [menuItems[0].key]
        : ["/admin/dashboard"];
  }, [location.pathname, menuItems]);

  const blocked =
    profile &&
    location.pathname.startsWith("/admin") &&
    !pathAllowedForRole(location.pathname, profile.role);

  if (blocked) {
    return <Navigate to={defaultAdminHomePath(profile.role)} replace />;
  }

  return (
    <Layout style={{ minHeight: "100vh", background: token.colorBgLayout }}>
      <Sider breakpoint="lg" collapsedWidth={0} width={240}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${token.colorSplit}`,
          }}>
          <Text strong style={{ fontSize: 15, color: token.colorText }}>
            {zhtw.admin.layout.title}
          </Text>
        </div>
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={selectedKeys}
          items={menuItems.map((m) => ({
            key: m.key,
            icon: m.icon,
            label: m.label,
          }))}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, background: "transparent" }}
        />
      </Sider>
      <Layout style={{ background: token.colorBgLayout }}>
        <Header
          style={{
            background: token.colorBgContainer,
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 16,
            borderBottom: `1px solid ${token.colorSplit}`,
          }}>
          <Space size="middle" wrap>
            {profile ? (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {profile.name} ·{" "}
                {isAdminRole(profile.role)
                  ? zhtw.admin.layout.roleAdmin
                  : isManagerRole(profile.role)
                    ? zhtw.admin.layout.roleManager
                    : zhtw.admin.layout.roleStaff}
              </Text>
            ) : null}
            <Link to="/" style={{ color: token.colorLink, fontWeight: 500 }}>
              {zhtw.admin.layout.backToPos}
            </Link>
            <Button
              type="link"
              onClick={() => void signOut()}
              style={{ padding: 0 }}>
              {zhtw.auth.signOut}
            </Button>
          </Space>
        </Header>
        <Content
          style={{
            margin: 0,
            minHeight: 280,
            background: token.colorBgLayout,
          }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
