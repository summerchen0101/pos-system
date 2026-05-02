import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  canManageStocktakeForWarehouse,
  isAdminRole,
} from "../api/authProfile";
import {
  createConsumptionSheetAdmin,
  deleteConsumptionDraftAdmin,
  listConsumptionSheetsAdmin,
  type ConsumptionSheetListEntry,
  type ConsumptionSheetStatus,
} from "../api/consumptionSheetsAdmin";
import { listWarehousesAdmin } from "../api/inventoryAdmin";
import { useAuth } from "../auth/AuthContext";
import { zhtw } from "../locales/zhTW";

const { Title, Text } = Typography;
const cs = zhtw.admin.consumptionSheets;
const common = zhtw.common;

type FilterValues = {
  warehouseId?: string | null;
  status?: ConsumptionSheetStatus | null;
  range?: [Dayjs, Dayjs] | null;
};

type CreateForm = {
  warehouseId: string;
  note?: string;
  consumptionDate?: Dayjs | null;
};

function createErrorMessage(raw: string): string {
  if (raw.includes("forbidden")) return cs.submitForbidden;
  return raw || cs.createError;
}

export function AdminConsumptionSheetsPage() {
  const { message, modal } = App.useApp();
  const { profile } = useAuth();
  const admin = profile ? isAdminRole(profile.role) : false;
  const canCreate = Boolean(
    profile && (admin || profile.managedWarehouseIds.length > 0),
  );
  const navigate = useNavigate();
  const [filterForm] = Form.useForm<FilterValues>();
  const [createForm] = Form.useForm<CreateForm>();
  const [rows, setRows] = useState<ConsumptionSheetListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [warehouseOptions, setWarehouseOptions] = useState<{ value: string; label: string }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadWarehouses = useCallback(async () => {
    try {
      const wh = await listWarehousesAdmin();
      setWarehouseOptions(wh.map((w) => ({ value: w.id, label: w.name })));
    } catch (e) {
      message.error(e instanceof Error ? e.message : cs.loadError);
    }
  }, [message]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      let v: Partial<FilterValues> = {};
      try {
        v = await filterForm.validateFields();
      } catch {
        v = filterForm.getFieldsValue();
      }
      const range = v.range;
      const data = await listConsumptionSheetsAdmin({
        warehouseId: v.warehouseId ?? null,
        status: v.status ?? null,
        rangeStart: range?.[0] ? range[0].startOf("day").toDate() : null,
        rangeEnd: range?.[1] ? range[1].endOf("day").toDate() : null,
      });
      setRows(data);
    } catch (e) {
      message.error(e instanceof Error ? e.message : cs.loadError);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filterForm, message]);

  const scopedWarehouseOptions = useMemo(() => {
    if (!profile) return [] as { value: string; label: string }[];
    if (isAdminRole(profile.role)) return warehouseOptions;
    const allowed = new Set(profile.managedWarehouseIds);
    return warehouseOptions.filter((o) => allowed.has(o.value));
  }, [profile, warehouseOptions]);

  useEffect(() => {
    void loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ consumptionDate: dayjs() });
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    try {
      const v = await createForm.validateFields();
      setCreating(true);
      const id = await createConsumptionSheetAdmin({
        warehouseId: v.warehouseId,
        note: v.note?.trim() ? v.note.trim() : null,
        consumptionDate: v.consumptionDate ? v.consumptionDate.format("YYYY-MM-DD") : null,
      });
      message.success(cs.createdOk);
      setCreateOpen(false);
      navigate(`/admin/inventory/consumption-sheets/${id}`);
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: string }).message)
          : "";
      message.error(createErrorMessage(msg));
    } finally {
      setCreating(false);
    }
  };

  const onDeleteDraft = (row: ConsumptionSheetListEntry) => {
    modal.confirm({
      title: cs.deleteTitle,
      content: cs.deleteBody,
      okText: common.delete,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteConsumptionDraftAdmin(row.id);
          message.success(cs.deletedOk);
          await fetchList();
        } catch (err) {
          message.error(err instanceof Error ? err.message : cs.createError);
        }
      },
    });
  };

  const columns: ColumnsType<ConsumptionSheetListEntry> = [
    {
      title: cs.colConsumptionDate,
      dataIndex: "consumptionDate",
      key: "cd",
      width: 120,
      render: (d: string) => d,
    },
    {
      title: cs.colCreatedAt,
      dataIndex: "createdAt",
      key: "c",
      width: 168,
      render: (iso: string) => dayjs(iso).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: cs.colLastEditedAt,
      dataIndex: "lastEditedAt",
      key: "u",
      width: 168,
      render: (iso: string) => dayjs(iso).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: cs.colWarehouse,
      key: "w",
      render: (_, r) => r.warehouseName ?? common.dash,
    },
    {
      title: cs.colStatus,
      dataIndex: "status",
      key: "s",
      width: 100,
      render: (s: ConsumptionSheetStatus) =>
        s === "draft" ? cs.statusDraft : cs.statusCompleted,
    },
    {
      title: cs.colNote,
      dataIndex: "note",
      key: "n",
      ellipsis: true,
      render: (n: string | null) => n?.trim() || common.dash,
    },
    {
      title: cs.colOperator,
      key: "op",
      width: 120,
      render: (_, r) => r.createdByName ?? common.dash,
    },
    {
      title: cs.colActions,
      key: "a",
      width: 220,
      render: (_, r) => (
        <Space size={0} wrap>
          {r.status === "draft" ? (
            <>
              <Link to={`/admin/inventory/consumption-sheets/${r.id}`}>
                <Button type="link" size="small">
                  {cs.editSheet}
                </Button>
              </Link>
              {profile && canManageStocktakeForWarehouse(profile, r.warehouseId) ? (
                <Button type="link" size="small" danger onClick={() => onDeleteDraft(r)}>
                  {cs.deleteDraft}
                </Button>
              ) : null}
            </>
          ) : (
            <Link to={`/admin/inventory/consumption-sheets/${r.id}`}>
              <Button type="link" size="small">
                {cs.viewDetail}
              </Button>
            </Link>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="admin-page">
      <Space align="center" style={{ justifyContent: "space-between", width: "100%", marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          {cs.pageTitle}
        </Title>
        {canCreate ? (
          <Button type="primary" onClick={openCreate}>
            {cs.newSheet}
          </Button>
        ) : null}
      </Space>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        {cs.hint}
      </Text>
      <Card style={{ marginBottom: 16 }}>
        <Form form={filterForm} layout="vertical">
          <Space wrap size="middle" align="start">
            <Form.Item name="warehouseId" label={cs.filterWarehouse} style={{ marginBottom: 0 }}>
              <Select
                allowClear
                placeholder={cs.filterAllWarehouses}
                style={{ minWidth: 200 }}
                options={scopedWarehouseOptions}
              />
            </Form.Item>
            <Form.Item name="status" label={cs.filterStatus} style={{ marginBottom: 0 }}>
              <Select
                allowClear
                placeholder={cs.filterAllStatus}
                style={{ minWidth: 140 }}
                options={[
                  { value: "draft", label: cs.statusDraft },
                  { value: "completed", label: cs.statusCompleted },
                ]}
              />
            </Form.Item>
            <Form.Item name="range" label={cs.filterRange} style={{ marginBottom: 0 }}>
              <DatePicker.RangePicker />
            </Form.Item>
            <Form.Item label=" " style={{ marginBottom: 0 }}>
              <Button type="primary" onClick={() => void fetchList()}>
                {common.apply}
              </Button>
            </Form.Item>
          </Space>
        </Form>
      </Card>
      <Card>
        <Table<ConsumptionSheetListEntry>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 15 }}
        />
      </Card>

      <Modal
        title={cs.modalCreateTitle}
        open={canCreate && createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submitCreate()}
        confirmLoading={creating}
        destroyOnClose
        okText={common.save}>
        <Form form={createForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="warehouseId"
            label={cs.labelWarehouse}
            rules={[{ required: true, message: common.required }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={scopedWarehouseOptions}
              placeholder={cs.labelWarehouse}
            />
          </Form.Item>
          <Form.Item name="consumptionDate" label={cs.labelConsumptionDate}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label={cs.labelNote}>
            <Input.TextArea rows={2} placeholder={cs.notePh} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
