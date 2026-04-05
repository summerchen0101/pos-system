import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import {
  createBooth,
  deleteBooth,
  listBoothsAdmin,
  updateBooth,
  type AdminBooth,
} from "../api/boothsAdmin";
import { zhtw } from "../locales/zhTW";

const { Title, Text } = Typography;
const b = zhtw.admin.booths;
const common = zhtw.common;

type FormValues = {
  name: string;
  location?: string;
};

function boothDeleteErrorMessage(raw: string): string {
  if (raw === "BOOTH_DELETE_DEFAULT") return b.cannotDeleteDefault;
  if (raw === "BOOTH_HAS_ORDERS") return b.deleteBlockedOrders;
  if (raw === "BOOTH_HAS_PROMOTIONS") return b.deleteBlockedPromotions;
  return b.deleteError;
}

export function AdminBoothsPage() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [rows, setRows] = useState<AdminBooth[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listBoothsAdmin());
    } catch (e) {
      message.error(e instanceof Error ? e.message : b.loadError);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ name: "", location: "" });
    setModalOpen(true);
  };

  const onDelete = (row: AdminBooth) => {
    modal.confirm({
      title: b.deleteTitle,
      content: b.deleteBody(row.name),
      okText: common.delete,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteBooth(row.id);
          message.success(b.deleted);
          await load();
        } catch (e) {
          const code = e instanceof Error ? e.message : "";
          message.error(boothDeleteErrorMessage(code));
        }
      },
    });
  };

  const openEdit = (row: AdminBooth) => {
    setEditingId(row.id);
    form.setFieldsValue({
      name: row.name,
      location: row.location ?? "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    form.resetFields();
  };

  const submit = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      if (editingId) {
        await updateBooth(editingId, {
          name: v.name,
          location: v.location?.trim() ? v.location.trim() : null,
        });
        message.success(b.updated);
      } else {
        await createBooth({
          name: v.name,
          location: v.location?.trim() ? v.location.trim() : null,
        });
        message.success(b.created);
      }
      closeModal();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(e instanceof Error ? e.message : b.saveError);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<AdminBooth> = [
    { title: b.colName, dataIndex: "name", key: "name" },
    {
      title: b.colLocation,
      dataIndex: "location",
      key: "loc",
      render: (loc: string | null) => loc?.trim() || common.dash,
    },
    {
      title: b.colActions,
      key: "act",
      width: 148,
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

  return (
    <div className="admin-page">
      <Space
        align="center"
        style={{
          justifyContent: "space-between",
          width: "100%",
          marginBottom: 16,
        }}>
        <Title level={4} style={{ margin: 0 }}>
          {b.pageTitle}
        </Title>
        <Button type="primary" onClick={openCreate}>
          {b.newBooth}
        </Button>
      </Space>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        {b.hint}
      </Text>
      <Card>
        <Table<AdminBooth>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 12 }}
        />
      </Card>

      <Modal
        title={editingId ? b.modalEdit : b.modalCreate}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void submit()}
        confirmLoading={saving}
        destroyOnClose
        okText={common.save}>
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="name"
            label={b.labelName}
            rules={[{ required: true, message: common.required }]}>
            <Input placeholder={b.namePh} />
          </Form.Item>
          <Form.Item name="location" label={b.labelLocation}>
            <Input placeholder={b.locationPh} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
