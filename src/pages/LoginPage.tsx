import { App, Button, Card, Form, Input, Spin, Typography } from "antd";
import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { prefersAdminDashboardLanding } from "../api/authProfile";
import { useAuth } from "../auth/AuthContext";
import { zhtw } from "../locales/zhTW";
import "../components/pos/pos.css";

const { Title, Text } = Typography;
const a = zhtw.auth;

export function LoginPage() {
  const { message } = App.useApp();
  const { session, profile, loading, signIn } = useAuth();
  const [form] = Form.useForm<{ username: string; password: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  useEffect(() => {
    if (session && profile) {
      const target =
        from && from !== "/login"
          ? from
          : prefersAdminDashboardLanding(profile.role)
            ? "/admin/dashboard"
            : "/";
      navigate(target, { replace: true });
    }
  }, [session, profile, from, navigate]);

  if (loading || (session && profile)) {
    return (
      <div className="pos-layout" style={{ gridTemplateColumns: "1fr", placeItems: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (session && !profile) {
    return <Navigate to="/" replace />;
  }

  const onFinish = async (v: { username: string; password: string }) => {
    try {
      await signIn(v.username, v.password);
      message.success(a.loginOk);
    } catch {
      message.error(a.loginInvalidCredentials);
    }
  };

  return (
    <div
      className="pos-layout"
      style={{ gridTemplateColumns: "1fr", placeItems: "center", padding: "2rem" }}>
      <Card
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--pos-cart-bg)",
          borderColor: "var(--pos-border)",
        }}>
        <Title level={3} style={{ marginTop: 0, color: "var(--pos-text-strong)" }}>
          {a.loginTitle}
        </Title>
        <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
          {a.loginSubtitle}
        </Text>
        <Form form={form} layout="vertical" onFinish={(v) => void onFinish(v)} requiredMark={false}>
          <Form.Item
            name="username"
            label={a.usernameLabel}
            rules={[{ required: true, message: zhtw.common.required }]}>
            <Input autoComplete="username" placeholder={a.usernamePh} />
          </Form.Item>
          <Form.Item
            name="password"
            label={a.passwordLabel}
            rules={[{ required: true, message: zhtw.common.required }]}>
            <Input.Password autoComplete="current-password" placeholder={a.passwordPh} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large">
            {a.signIn}
          </Button>
        </Form>
        <Text type="secondary" style={{ display: "block", marginTop: 16, fontSize: 13, textAlign: "center" }}>
          {a.acquireAccountHint}
        </Text>
      </Card>
    </div>
  );
}
