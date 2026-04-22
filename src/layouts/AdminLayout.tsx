import {
  AppstoreOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  GiftOutlined,
  HistoryOutlined,
  InboxOutlined,
  PieChartOutlined,
  ScheduleOutlined,
  ShopOutlined,
  ShoppingOutlined,
  SkinOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Layout, Menu, Space, Typography, theme } from "antd";
import type { ItemType } from "antd/es/menu/interface";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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
} from "../api/authProfile";
import { menuKeysForRole, pathAllowedForRole } from "../api/adminPathRules";
import { useAuth } from "../auth/AuthContext";
import { zhtw } from "../locales/zhTW";
import { palette } from "../theme/palette";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

type MenuDef = { key: string; icon: ReactNode; label: string };

function collectLeafKeys(items: ItemType[]): string[] {
  const keys: string[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    if ("type" in it && it.type === "divider") continue;
    if ("children" in it && it.children) {
      for (const ch of it.children) {
        if (ch && typeof ch === "object" && "key" in ch && typeof ch.key === "string") {
          keys.push(ch.key);
        }
      }
    } else if ("key" in it && typeof it.key === "string" && !it.key.startsWith("sub:")) {
      keys.push(it.key);
    }
  }
  return keys;
}

function matchSelectedMenuKey(pathname: string, items: ItemType[]): string[] {
  const leaves = collectLeafKeys(items);
  const hit = [...leaves]
    .filter((k) => pathname === k || pathname.startsWith(`${k}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (hit) return [hit];
  return leaves.length > 0 ? [leaves[0]] : ["/admin/dashboard"];
}

export function AdminLayout() {
  const { token } = theme.useToken();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const [openKeys, setOpenKeys] = useState<string[]>([]);

  const fullMenuItems: MenuDef[] = useMemo(
    () => [
      {
        key: "/admin/dashboard",
        icon: <DashboardOutlined />,
        label: zhtw.admin.layout.menuDashboard,
      },
      {
        key: "/admin/analytics",
        icon: <PieChartOutlined />,
        label: zhtw.admin.layout.menuAnalytics,
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

  const menuItems: ItemType[] = useMemo(() => {
    if (!profile) return [];
    const allowed = menuKeysForRole(profile.role);
    const filtered = fullMenuItems.filter((m) => allowed.has(m.key));
    let flat: ItemType[] = filtered.map((m) => ({
      key: m.key,
      icon: m.icon,
      label: m.label,
    }));
    if (isManagerRole(profile.role) && !isAdminRole(profile.role)) {
      const idx = flat.findIndex((x) => x && typeof x === "object" && "key" in x && x.key === "/admin/clock-logs");
      const st: ItemType = {
        key: "/admin/inventory/stocktakes",
        icon: <InboxOutlined />,
        label: zhtw.admin.layout.menuStocktakes,
      };
      flat = [...flat.slice(0, idx + 1), st, ...flat.slice(idx + 1)];
    }
    if (!isAdminRole(profile.role)) return flat;
    const idx = flat.findIndex((x) => x && typeof x === "object" && "key" in x && x.key === "/admin/booths");
    const invMenu: ItemType = {
      key: "sub:inv",
      icon: <InboxOutlined />,
      label: zhtw.admin.layout.menuInventoryGroup,
      children: [
        { key: "/admin/inventory", label: zhtw.admin.layout.menuInventoryOverview },
        { key: "/admin/inventory/warehouses", label: zhtw.admin.layout.menuWarehouses },
        { key: "/admin/inventory/stocktakes", label: zhtw.admin.layout.menuStocktakes },
        { key: "/admin/inventory/logs", label: zhtw.admin.layout.menuInventoryLogs },
      ],
    };
    const out = [...flat];
    out.splice(idx >= 0 ? idx + 1 : out.length, 0, invMenu);
    return out;
  }, [fullMenuItems, profile]);

  const selectedKeys = useMemo(
    () => matchSelectedMenuKey(location.pathname, menuItems),
    [location.pathname, menuItems],
  );

  useEffect(() => {
    if (location.pathname.startsWith("/admin/inventory")) {
      setOpenKeys((prev) => (prev.includes("sub:inv") ? prev : [...prev, "sub:inv"]));
    }
  }, [location.pathname]);

  const blocked =
    profile &&
    location.pathname.startsWith("/admin") &&
    !pathAllowedForRole(location.pathname, profile.role);

  if (blocked) {
    return <Navigate to={defaultAdminHomePath(profile.role)} replace />;
  }

  return (
    <Layout style={{ minHeight: "100vh", background: token.colorBgLayout }}>
      <Sider
        breakpoint="lg"
        collapsedWidth={0}
        width={240}
        style={{ borderInlineEnd: `1px solid ${palette.border}` }}>
        <div
          style={{
            padding: "16px 20px",
            background: palette.cartBg,
            borderBottom: `1px solid ${palette.border}`,
          }}>
          <Text strong style={{ fontSize: 15, color: token.colorText }}>
            {zhtw.admin.layout.title}
          </Text>
        </div>
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={selectedKeys}
          openKeys={openKeys}
          onOpenChange={setOpenKeys}
          items={menuItems}
          onClick={({ key }) => {
            if (key.startsWith("/admin")) navigate(key);
          }}
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
            borderBottom: `1px solid ${palette.border}`,
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
