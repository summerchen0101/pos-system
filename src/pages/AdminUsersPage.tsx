import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { isAdminRole, type AppRole } from "../api/authProfile";
import { listBoothsAdmin, type AdminBooth } from "../api/boothsAdmin";
import {
  ManageUsersError,
  createManagedUser,
  deleteManagedUser,
  listManagedUsers,
  updateManagedUser,
  type ManagedUserRow,
} from "../api/manageUsersEdge";
import { useAuth } from "../auth/AuthContext";
import { zhtw } from "../locales/zhTW";

const { Title, Text } = Typography;
const u = zhtw.admin.users;
const common = zhtw.common;

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

type ModalMode = "create" | "edit" | null;

type CreateFormValues = {
  username: string;
  phone?: string;
  name: string;
  password: string;
  role: AppRole;
  boothIds: string[];
};

type EditFormValues = {
  username: string;
  phone?: string;
  name: string;
  role: AppRole;
  boothIds: string[];
  newPassword?: string;
};

function mapManageUsersError(code: string, fallback?: string): string {
  switch (code) {
    case "USERNAME_TAKEN":
      return u.errUsernameTaken;
    case "INVALID_USERNAME":
      return u.errInvalidUsername;
    case "EMAIL_TAKEN":
      return u.errEmailTaken;
    case "PASSWORD_SHORT":
      return u.errPasswordShort;
    case "INVALID_EMAIL":
      return u.errInvalidEmail;
    case "SELF_DELETE":
      return u.errSelfDelete;
    case "LAST_ADMIN":
      return u.errLastAdmin;
    case "FORBIDDEN":
    case "NO_AUTH":
    case "INVALID_SESSION":
      return u.errForbidden;
    case "INVALID_BOOTHS":
      return u.errInvalidBooths;
    case "INVOCATION_FAILED":
    case "NO_RESPONSE":
      return u.errFunctionUnavailable;
    default:
      return fallback ?? u.saveError;
  }
}

export function AdminUsersPage() {
  const { message, modal } = App.useApp();
  const { session, profile } = useAuth();
  const [createForm] = Form.useForm<CreateFormValues>();
  const [editForm] = Form.useForm<EditFormValues>();

  const [rows, setRows] = useState<ManagedUserRow[]>([]);
  const [booths, setBooths] = useState<AdminBooth[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<ManagedUserRow | null>(null);
  const [saving, setSaving] = useState(false);

  const token = session?.access_token;

  const load = useCallback(async () => {
    if (!token) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [ulist, blist] = await Promise.all([
        listManagedUsers(token),
        listBoothsAdmin(),
      ]);
      setRows(ulist);
      setBooths(blist);
    } catch (e) {
      const msg =
        e instanceof ManageUsersError
          ? mapManageUsersError(e.code, e.message)
          : u.loadError;
      message.error(e instanceof Error ? msg : u.loadError);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [message, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    createForm.resetFields();
    createForm.setFieldsValue({
      username: "",
      phone: "",
      name: "",
      password: "",
      role: "STAFF",
      boothIds: [],
    });
    setModalMode("create");
  };

  const openEdit = (row: ManagedUserRow) => {
    setEditing(row);
    editForm.setFieldsValue({
      username: row.username,
      phone: row.phone || "",
      name: row.name,
      role: row.role,
      boothIds: row.boothIds,
      newPassword: "",
    });
    setModalMode("edit");
  };

  const closeModal = () => {
    setModalMode(null);
    setEditing(null);
    createForm.resetFields();
    editForm.resetFields();
  };

  const submitCreate = async () => {
    if (!token) return;
    try {
      const v = await createForm.validateFields();
      setSaving(true);
      await createManagedUser(token, {
        username: v.username.trim().toLowerCase(),
        phone: v.phone?.trim(),
        name: v.name,
        password: v.password,
        role: v.role,
        boothIds: v.role === "STAFF" ? (v.boothIds ?? []) : [],
      });
      message.success(u.created);
      closeModal();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      const code = e instanceof ManageUsersError ? e.code : "";
      message.error(
        mapManageUsersError(code, e instanceof Error ? e.message : u.saveError),
      );
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async () => {
    if (!token || !editing) return;
    try {
      const v = await editForm.validateFields();
      setSaving(true);
      await updateManagedUser(token, {
        userId: editing.id,
        username: v.username.trim().toLowerCase(),
        phone: v.phone?.trim(),
        name: v.name,
        role: v.role,
        boothIds: v.role === "STAFF" ? (v.boothIds ?? []) : [],
        password: v.newPassword?.trim() ? v.newPassword.trim() : undefined,
      });
      message.success(u.updated);
      closeModal();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      const code = e instanceof ManageUsersError ? e.code : "";
      message.error(
        mapManageUsersError(code, e instanceof Error ? e.message : u.saveError),
      );
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (row: ManagedUserRow) => {
    if (!token) return;
    const selfId = session?.user.id;
    if (row.id === selfId) {
      message.error(u.errSelfDelete);
      return;
    }
    modal.confirm({
      title: u.deleteTitle,
      content: u.deleteBody(row.name, row.username),
      okText: common.delete,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteManagedUser(token, row.id);
          message.success(u.deleted);
          await load();
        } catch (e) {
          const code = e instanceof ManageUsersError ? e.code : "";
          message.error(
            mapManageUsersError(
              code,
              e instanceof Error ? e.message : u.deleteError,
            ),
          );
        }
      },
    });
  };

  const boothOptions = booths.map((b) => ({
    label: b.location ? `${b.name}（${b.location}）` : b.name,
    value: b.id,
  }));

  const usernameRules = [
    { required: true, message: common.required },
    {
      pattern: USERNAME_PATTERN,
      message: u.errInvalidUsername,
    },
  ];

  const columns: ColumnsType<ManagedUserRow> = [
    {
      title: u.colNameDisplay,
      dataIndex: "name",
      key: "name",
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: u.colUsername,
      dataIndex: "username",
      key: "username",
      ellipsis: true,
      render: (un: string) => (
        <Text copyable={{ text: un }} style={{ fontSize: 13 }}>
          {un}
        </Text>
      ),
    },
    {
      title: u.colPhone,
      dataIndex: "phone",
      key: "phone",
      ellipsis: true,
      render: (p: string) =>
        p ? <Text>{p}</Text> : <Text type="secondary">{common.dash}</Text>,
    },
    {
      title: u.colRole,
      dataIndex: "role",
      key: "role",
      width: 120,
      render: (r: AppRole) =>
        r === "ADMIN" ? (
          <Tag color="blue">{u.roleAdmin}</Tag>
        ) : (
          <Tag>{u.roleStaff}</Tag>
        ),
    },
    {
      title: u.colBooths,
      key: "booths",
      ellipsis: true,
      render: (_, row) => {
        if (row.role === "ADMIN") return u.allBooths;
        if (row.boothIds.length === 0) return common.dash;
        return row.boothIds
          .map((id) => booths.find((b) => b.id === id)?.name ?? id.slice(0, 8))
          .join("、");
      },
    },
    {
      title: u.colActions,
      key: "act",
      width: 160,
      render: (_, row) => (
        <Space size={0} wrap>
          <Button type="link" size="small" onClick={() => openEdit(row)}>
            {common.edit}
          </Button>
          <Button type="link" size="small" danger onClick={() => onDelete(row)}>
            {common.delete}
          </Button>
        </Space>
      ),
    },
  ];

  if (!profile) {
    return (
      <div className="admin-page" style={{ padding: "0 24px 24px" }}>
        <Text type="secondary">{common.loading}</Text>
      </div>
    );
  }

  if (!isAdminRole(profile.role)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return (
    <div className="admin-page">
      <Title level={4} style={{ marginTop: 0 }}>
        {u.pageTitle}
      </Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        {u.hint}
      </Text>
      <Card
        extra={
          <Button type="primary" onClick={openCreate}>
            {u.newUser}
          </Button>
        }>
        <Table<ManagedUserRow>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 12 }}
        />
      </Card>

      <Modal
        title={u.modalCreate}
        open={modalMode === "create"}
        onCancel={closeModal}
        onOk={() => void submitCreate()}
        confirmLoading={saving}
        destroyOnClose
        width={520}
        okText={common.save}>
        <Form
          form={createForm}
          layout="vertical"
          style={{ marginTop: 8 }}
          onValuesChange={(changed) => {
            if ("role" in changed && changed.role === "ADMIN") {
              createForm.setFieldsValue({ boothIds: [] });
            }
          }}>
          <Form.Item
            name="username"
            label={u.labelUsername}
            rules={usernameRules}>
            <Input placeholder={u.usernamePh} autoComplete="off" />
          </Form.Item>
          <Form.Item name="phone" label={u.labelPhone}>
            <Input placeholder={u.phonePh} autoComplete="tel" />
          </Form.Item>
          <Form.Item
            name="name"
            label={u.labelName}
            rules={[{ required: true, message: common.required }]}>
            <Input placeholder={u.namePh} autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="password"
            label={u.labelDefaultPassword}
            rules={[
              { required: true, message: common.required },
              { min: 6, message: u.errPasswordShort },
            ]}>
            <Input.Password
              placeholder={u.passwordPh}
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            name="role"
            label={u.labelRole}
            rules={[{ required: true }]}>
            <Select
              options={[
                { value: "ADMIN", label: u.roleAdmin },
                { value: "STAFF", label: u.roleStaff },
              ]}
            />
          </Form.Item>
          <Form.Item
            shouldUpdate={(prev, cur) => prev.role !== cur.role}
            noStyle>
            {() =>
              createForm.getFieldValue("role") === "STAFF" ? (
                <Form.Item name="boothIds" label={u.labelBooths}>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder={u.boothSelectPh}
                    options={boothOptions}
                    optionFilterProp="label"
                  />
                </Form.Item>
              ) : (
                <Text type="secondary">{u.adminBoothsHint}</Text>
              )
            }
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={u.modalEdit}
        open={modalMode === "edit"}
        onCancel={closeModal}
        onOk={() => void submitEdit()}
        confirmLoading={saving}
        destroyOnClose
        width={520}
        okText={common.save}>
        <Form
          form={editForm}
          layout="vertical"
          style={{ marginTop: 8 }}
          onValuesChange={(changed) => {
            if ("role" in changed && changed.role === "ADMIN") {
              editForm.setFieldsValue({ boothIds: [] });
            }
          }}>
          <Form.Item
            name="username"
            label={u.labelUsername}
            rules={usernameRules}>
            <Input placeholder={u.usernamePh} autoComplete="off" />
          </Form.Item>
          <Form.Item name="phone" label={u.labelPhone}>
            <Input placeholder={u.phonePh} autoComplete="tel" />
          </Form.Item>
          <Form.Item
            name="name"
            label={u.labelName}
            rules={[{ required: true, message: common.required }]}>
            <Input placeholder={u.namePh} autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="role"
            label={u.labelRole}
            rules={[{ required: true }]}>
            <Select
              options={[
                { value: "ADMIN", label: u.roleAdmin },
                { value: "STAFF", label: u.roleStaff },
              ]}
            />
          </Form.Item>
          <Form.Item
            shouldUpdate={(prev, cur) => prev.role !== cur.role}
            noStyle>
            {() =>
              editForm.getFieldValue("role") === "STAFF" ? (
                <Form.Item name="boothIds" label={u.labelBooths}>
                  <Select
                    mode="multiple"
                    allowClear
                    placeholder={u.boothSelectPh}
                    options={boothOptions}
                    optionFilterProp="label"
                  />
                </Form.Item>
              ) : (
                <Text type="secondary">{u.adminBoothsHint}</Text>
              )
            }
          </Form.Item>
          <Form.Item
            name="newPassword"
            label={u.labelResetPassword}
            extra={u.resetPasswordHint}
            rules={[
              {
                validator: (_, v) => {
                  const s = typeof v === "string" ? v.trim() : "";
                  if (s.length === 0) return Promise.resolve();
                  if (s.length < 6)
                    return Promise.reject(new Error(u.errPasswordShort));
                  return Promise.resolve();
                },
              },
            ]}>
            <Input.Password
              placeholder={u.resetPasswordPh}
              autoComplete="new-password"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
