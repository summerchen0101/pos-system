import { App, Button, Card, Form, Input, Modal, Select, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import {
  createWarehouseAdmin,
  deleteWarehouseAdmin,
  listWarehousesAdmin,
  updateWarehouseAdmin,
  type AdminWarehouse,
} from "../api/inventoryAdmin";
import { listBoothsAdmin } from "../api/boothsAdmin";
import { zhtw } from "../locales/zhTW";

const { Title, Text } = Typography;
const inv = zhtw.admin.inventory;
const common = zhtw.common;

type FormValues = {
  name: string;
  type: "warehouse" | "booth";
  boothId?: string | null;
  note?: string;
};

function deleteWarehouseMessage(code: string): string {
  if (code === "WAREHOUSE_HAS_STOCK") return inv.deleteWarehouseHasStock;
  if (code === "WAREHOUSE_BINDS_BOOTH") return inv.deleteWarehouseBindsBooth;
  return inv.deleteWarehouseError;
}

export function AdminWarehousesPage() {
  const { message, modal } = App.useApp();
  const [rows, setRows] = useState<AdminWarehouse[]>([]);
  const [boothOptions, setBoothOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [wh, booths] = await Promise.all([listWarehousesAdmin(), listBoothsAdmin()]);
      setRows(wh);
      setBoothOptions(booths.map((b) => ({ value: b.id, label: b.name })));
    } catch (e) {
      message.error(e instanceof Error ? e.message : inv.loadError);
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
    form.setFieldsValue({ name: "", type: "warehouse", boothId: undefined, note: "" });
    setModalOpen(true);
  };

  const openEdit = (row: AdminWarehouse) => {
    setEditingId(row.id);
    form.setFieldsValue({
      name: row.name,
      type: row.type,
      boothId: row.boothId ?? undefined,
      note: row.note ?? "",
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
        await updateWarehouseAdmin(editingId, {
          name: v.name,
          type: v.type,
          boothId: v.type === "booth" ? (v.boothId ?? null) : null,
          note: v.note?.trim() ? v.note.trim() : null,
        });
        message.success(inv.updatedWarehouse);
      } else {
        await createWarehouseAdmin({
          name: v.name,
          type: v.type,
          boothId: v.type === "booth" ? (v.boothId ?? null) : null,
          note: v.note?.trim() ? v.note.trim() : null,
        });
        message.success(inv.createdWarehouse);
      }
      closeModal();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(e instanceof Error ? e.message : inv.saveError);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (row: AdminWarehouse) => {
    modal.confirm({
      title: inv.deleteWarehouseTitle,
      content: inv.deleteWarehouseBody(row.name),
      okText: common.delete,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteWarehouseAdmin(row.id);
          message.success(inv.deletedWarehouse);
          await load();
        } catch (e) {
          const code = e instanceof Error ? e.message : "";
          message.error(deleteWarehouseMessage(code));
        }
      },
    });
  };

  const typeLabel = (t: AdminWarehouse["type"]) =>
    t === "booth" ? inv.warehouseTypeBooth : inv.warehouseTypeWarehouse;

  const columns: ColumnsType<AdminWarehouse> = [
    { title: inv.colWarehouseName, dataIndex: "name", key: "name" },
    {
      title: inv.colWarehouseType,
      dataIndex: "type",
      key: "type",
      width: 100,
      render: (t: AdminWarehouse["type"]) => typeLabel(t),
    },
    {
      title: inv.colBindBooth,
      key: "booth",
      render: (_, row) => row.boothName?.trim() || common.dash,
    },
    {
      title: inv.colNote,
      dataIndex: "note",
      key: "note",
      ellipsis: true,
      render: (n: string | null) => n?.trim() || common.dash,
    },
    {
      title: inv.colActions,
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

  const whType = Form.useWatch("type", form);

  return (
    <div className="admin-page">
      <Space align="center" style={{ justifyContent: "space-between", width: "100%", marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          {inv.warehousesTitle}
        </Title>
        <Button type="primary" onClick={openCreate}>
          {inv.newWarehouse}
        </Button>
      </Space>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        {inv.warehousesHint}
      </Text>
      <Card>
        <Table<AdminWarehouse>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 12 }}
        />
      </Card>

      <Modal
        title={editingId ? inv.modalEditWarehouse : inv.modalCreateWarehouse}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void submit()}
        confirmLoading={saving}
        destroyOnClose
        okText={common.save}>
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="name"
            label={inv.labelWarehouseName}
            rules={[{ required: true, message: common.required }]}>
            <Input placeholder={inv.labelWarehouseName} />
          </Form.Item>
          <Form.Item
            name="type"
            label={inv.labelWarehouseType}
            rules={[{ required: true, message: common.required }]}>
            <Select
              disabled={Boolean(editingId)}
              options={[
                { value: "warehouse", label: inv.warehouseTypeWarehouse },
                { value: "booth", label: inv.warehouseTypeBooth },
              ]}
            />
          </Form.Item>
          {whType === "booth" ? (
            <Form.Item
              name="boothId"
              label={inv.labelBindBooth}
              rules={[{ required: true, message: common.required }]}>
              <Select
                showSearch
                allowClear
                optionFilterProp="label"
                options={boothOptions}
                placeholder={inv.bindBoothPh}
              />
            </Form.Item>
          ) : null}
          <Form.Item name="note" label={inv.colNote}>
            <Input.TextArea rows={2} placeholder={inv.notePh} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
