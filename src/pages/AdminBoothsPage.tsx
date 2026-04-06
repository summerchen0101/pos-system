import {
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import {
  copyBoothAdmin,
  createBooth,
  deleteBooth,
  listBoothsAdmin,
  updateBooth,
  type AdminBooth,
} from "../api/boothsAdmin";
import { formatBoothActivityRangeLabel } from "../lib/boothActivity";
import { zhtw } from "../locales/zhTW";

const { Title, Text } = Typography;
const b = zhtw.admin.booths;
const common = zhtw.common;

type FormValues = {
  name: string;
  location?: string;
  start_date?: Dayjs | null;
  end_date?: Dayjs | null;
};

type CopyFormValues = {
  name: string;
  location?: string;
  start_date?: Dayjs | null;
  end_date?: Dayjs | null;
  copyPromotions: boolean;
  copyProducts: boolean;
};

function boothDeleteErrorMessage(raw: string): string {
  if (raw === "BOOTH_DELETE_DEFAULT") return b.cannotDeleteDefault;
  if (raw === "BOOTH_HAS_ORDERS") return b.deleteBlockedOrders;
  return b.deleteError;
}

function activityPeriodCell(row: AdminBooth): string {
  const label = formatBoothActivityRangeLabel(row.start_date, row.end_date);
  return label ?? b.activityDash;
}

export function AdminBoothsPage() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [copyForm] = Form.useForm<CopyFormValues>();
  const [rows, setRows] = useState<AdminBooth[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySource, setCopySource] = useState<AdminBooth | null>(null);
  const [copySaving, setCopySaving] = useState(false);

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
    form.setFieldsValue({ name: "", location: "", start_date: undefined, end_date: undefined });
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
      start_date: row.start_date ? dayjs(row.start_date) : undefined,
      end_date: row.end_date ? dayjs(row.end_date) : undefined,
    });
    setModalOpen(true);
  };

  const openCopy = (row: AdminBooth) => {
    setCopySource(row);
    copyForm.setFieldsValue({
      name: `${row.name}（複製）`,
      location: row.location ?? "",
      start_date: undefined,
      end_date: undefined,
      copyPromotions: true,
      copyProducts: true,
    });
    setCopyModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    form.resetFields();
  };

  const closeCopyModal = () => {
    setCopyModalOpen(false);
    setCopySource(null);
    copyForm.resetFields();
  };

  const dateToIso = (d: Dayjs | null | undefined): string | null =>
    d && d.isValid() ? d.format("YYYY-MM-DD") : null;

  const submit = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const startDate = dateToIso(v.start_date ?? null);
      const endDate = dateToIso(v.end_date ?? null);
      if (editingId) {
        await updateBooth(editingId, {
          name: v.name,
          location: v.location?.trim() ? v.location.trim() : null,
          startDate,
          endDate,
        });
        message.success(b.updated);
      } else {
        await createBooth({
          name: v.name,
          location: v.location?.trim() ? v.location.trim() : null,
          startDate,
          endDate,
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

  const submitCopy = async () => {
    if (!copySource) return;
    try {
      const v = await copyForm.validateFields();
      setCopySaving(true);
      const { promotionsCopied } = await copyBoothAdmin({
        sourceBoothId: copySource.id,
        name: v.name.trim(),
        location: v.location?.trim() ? v.location.trim() : null,
        startDate: dateToIso(v.start_date ?? null),
        endDate: dateToIso(v.end_date ?? null),
        copyPromotions: v.copyPromotions,
        copyProductSettings: v.copyProducts,
      });
      message.success(b.copiedWithPromotions(promotionsCopied));
      closeCopyModal();
      await load();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error(e instanceof Error ? e.message : b.copyError);
    } finally {
      setCopySaving(false);
    }
  };

  const dateOrderValidator = (_: unknown, endVal: Dayjs | null | undefined) => {
    const start = form.getFieldValue("start_date") as Dayjs | null | undefined;
    if (!start || !endVal || !start.isValid() || !endVal.isValid()) return Promise.resolve();
    if (!endVal.isAfter(start, "day")) {
      return Promise.reject(new Error(b.dateOrderError));
    }
    return Promise.resolve();
  };

  const copyDateOrderValidator = (_: unknown, endVal: Dayjs | null | undefined) => {
    const start = copyForm.getFieldValue("start_date") as Dayjs | null | undefined;
    if (!start || !endVal || !start.isValid() || !endVal.isValid()) return Promise.resolve();
    if (!endVal.isAfter(start, "day")) {
      return Promise.reject(new Error(b.dateOrderError));
    }
    return Promise.resolve();
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
      title: b.colActivityPeriod,
      key: "period",
      width: 200,
      render: (_, row) => activityPeriodCell(row),
    },
    {
      title: b.colActions,
      key: "act",
      width: 200,
      render: (_, row) => (
        <Space size={0} wrap>
          <Button type="link" size="small" onClick={() => openEdit(row)}>
            {common.edit}
          </Button>
          <Button type="link" size="small" onClick={() => openCopy(row)}>
            {b.copy}
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
          <Form.Item name="start_date" label={b.labelStartDate}>
            <DatePicker style={{ width: "100%" }} allowClear />
          </Form.Item>
          <Form.Item
            name="end_date"
            label={b.labelEndDate}
            dependencies={["start_date"]}
            rules={[{ validator: dateOrderValidator }]}>
            <DatePicker style={{ width: "100%" }} allowClear />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={b.copyModalTitle}
        open={copyModalOpen}
        onCancel={closeCopyModal}
        onOk={() => void submitCopy()}
        confirmLoading={copySaving}
        destroyOnClose
        okText={b.copyConfirm}>
        <Form form={copyForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="name"
            label={b.labelName}
            rules={[{ required: true, message: common.required }]}>
            <Input placeholder={b.namePh} />
          </Form.Item>
          <Form.Item name="location" label={b.labelLocation}>
            <Input placeholder={b.locationPh} />
          </Form.Item>
          <Form.Item name="start_date" label={b.labelStartDate}>
            <DatePicker style={{ width: "100%" }} allowClear />
          </Form.Item>
          <Form.Item
            name="end_date"
            label={b.labelEndDate}
            dependencies={["start_date"]}
            rules={[{ validator: copyDateOrderValidator }]}>
            <DatePicker style={{ width: "100%" }} allowClear />
          </Form.Item>
          <Form.Item name="copyPromotions" valuePropName="checked">
            <Checkbox>{b.copyPromotions}</Checkbox>
          </Form.Item>
          <Form.Item
            name="copyProducts"
            valuePropName="checked"
            extra={<Text type="secondary">{b.copyProductsHint}</Text>}>
            <Checkbox>{b.copyProducts}</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
