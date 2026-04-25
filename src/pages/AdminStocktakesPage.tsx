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
import { listWarehousesAdmin } from "../api/inventoryAdmin";
import {
  canManageStocktakeForWarehouse,
  isAdminRole,
} from "../api/authProfile";
import {
  createStocktakeAdmin,
  deleteStocktakeDraftAdmin,
  listStocktakesAdmin,
  type StocktakeListEntry,
  type StocktakeStatus,
} from "../api/stocktakesAdmin";
import { useAuth } from "../auth/AuthContext";
import { zhtw } from "../locales/zhTW";

const { Title, Text } = Typography;
const st = zhtw.admin.stocktakes;
const common = zhtw.common;

type FilterValues = {
  warehouseId?: string | null;
  status?: StocktakeStatus | null;
  range?: [Dayjs, Dayjs] | null;
};

type CreateForm = {
  warehouseId: string;
  note?: string;
};

function stocktakeErrorMessage(raw: string): string {
  if (raw.includes("stocktake_draft_exists")) return st.draftExistsError;
  return raw || st.createError;
}

export function AdminStocktakesPage() {
  const { message, modal } = App.useApp();
  const { profile } = useAuth();
  const admin = profile ? isAdminRole(profile.role) : false;
  const canCreateStocktake = Boolean(
    profile && (admin || profile.managedWarehouseIds.length > 0),
  );
  const navigate = useNavigate();
  const [filterForm] = Form.useForm<FilterValues>();
  const [createForm] = Form.useForm<CreateForm>();
  const [rows, setRows] = useState<StocktakeListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [warehouseOptions, setWarehouseOptions] = useState<{ value: string; label: string }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadWarehouses = useCallback(async () => {
    try {
      const wh = await listWarehousesAdmin();
      setWarehouseOptions(wh.map((w) => ({ value: w.id, label: w.name })));
    } catch (e) {
      message.error(e instanceof Error ? e.message : st.loadError);
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
      const data = await listStocktakesAdmin({
        warehouseId: v.warehouseId ?? null,
        status: v.status ?? null,
        rangeStart: range?.[0] ? range[0].startOf("day").toDate() : null,
        rangeEnd: range?.[1] ? range[1].endOf("day").toDate() : null,
      });
      setRows(data);
    } catch (e) {
      message.error(e instanceof Error ? e.message : st.loadError);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filterForm, message]);

  useEffect(() => {
    void loadWarehouses();
  }, [loadWarehouses]);

  const scopedWarehouseOptions = useMemo(() => {
    if (!profile) return [] as { value: string; label: string }[];
    if (isAdminRole(profile.role)) return warehouseOptions;
    const allowed = new Set(profile.managedWarehouseIds);
    return warehouseOptions.filter((o) => allowed.has(o.value));
  }, [profile, warehouseOptions]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const openCreate = () => {
    createForm.resetFields();
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    try {
      const v = await createForm.validateFields();
      setCreating(true);
      const id = await createStocktakeAdmin({
        warehouseId: v.warehouseId,
        note: v.note?.trim() ? v.note.trim() : null,
      });
      message.success(st.createdOk);
      setCreateOpen(false);
      navigate(`/admin/inventory/stocktakes/${id}`);
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "";
      message.error(stocktakeErrorMessage(msg));
    } finally {
      setCreating(false);
    }
  };

  const onDeleteDraft = (row: StocktakeListEntry) => {
    modal.confirm({
      title: st.deleteTitle,
      content: st.deleteBody,
      okText: common.delete,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteStocktakeDraftAdmin(row.id);
          message.success(st.deletedOk);
          await fetchList();
        } catch (err) {
          message.error(err instanceof Error ? err.message : st.createError);
        }
      },
    });
  };

  const columns: ColumnsType<StocktakeListEntry> = [
    {
      title: st.colCreatedAt,
      dataIndex: "createdAt",
      key: "c",
      width: 168,
      render: (iso: string) => dayjs(iso).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: st.colLastEditedAt,
      dataIndex: "lastEditedAt",
      key: "u",
      width: 168,
      render: (iso: string) => dayjs(iso).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: st.colWarehouse,
      key: "w",
      render: (_, r) => r.warehouseName ?? common.dash,
    },
    {
      title: st.colStatus,
      dataIndex: "status",
      key: "s",
      width: 100,
      render: (s: StocktakeStatus) => (s === "draft" ? st.statusDraft : st.statusCompleted),
    },
    {
      title: st.colNote,
      dataIndex: "note",
      key: "n",
      ellipsis: true,
      render: (n: string | null) => n?.trim() || common.dash,
    },
    {
      title: st.colOperator,
      key: "op",
      width: 120,
      render: (_, r) => r.createdByName ?? common.dash,
    },
    {
      title: st.colActions,
      key: "a",
      width: 200,
      render: (_, r) => (
        <Space size={0} wrap>
          {r.status === "draft" ? (
            <>
              <Link to={`/admin/inventory/stocktakes/${r.id}`}>
                <Button type="link" size="small">
                  {st.editStocktake}
                </Button>
              </Link>
              {profile && canManageStocktakeForWarehouse(profile, r.warehouseId) ? (
                <Button type="link" size="small" danger onClick={() => onDeleteDraft(r)}>
                  {st.deleteDraft}
                </Button>
              ) : null}
            </>
          ) : (
            <Link to={`/admin/inventory/stocktakes/${r.id}`}>
              <Button type="link" size="small">
                {st.viewDetail}
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
          {st.pageTitle}
        </Title>
        {canCreateStocktake ? (
          <Button type="primary" onClick={openCreate}>
            {st.newStocktake}
          </Button>
        ) : null}
      </Space>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        {st.hint}
      </Text>
      <Card style={{ marginBottom: 16 }}>
        <Form form={filterForm} layout="vertical">
          <Space wrap size="middle" align="start">
            <Form.Item name="warehouseId" label={st.filterWarehouse} style={{ marginBottom: 0 }}>
              <Select
                allowClear
                placeholder={st.filterAllWarehouses}
                style={{ minWidth: 200 }}
                options={scopedWarehouseOptions}
              />
            </Form.Item>
            <Form.Item name="status" label={st.filterStatus} style={{ marginBottom: 0 }}>
              <Select
                allowClear
                placeholder={st.filterAllStatus}
                style={{ minWidth: 140 }}
                options={[
                  { value: "draft", label: st.statusDraft },
                  { value: "completed", label: st.statusCompleted },
                ]}
              />
            </Form.Item>
            <Form.Item name="range" label={st.filterRange} style={{ marginBottom: 0 }}>
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
        <Table<StocktakeListEntry>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 15 }}
        />
      </Card>

      <Modal
        title={st.modalCreateTitle}
        open={canCreateStocktake && createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submitCreate()}
        confirmLoading={creating}
        destroyOnClose
        okText={common.save}>
        <Form form={createForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="warehouseId"
            label={st.labelWarehouse}
            rules={[{ required: true, message: common.required }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={scopedWarehouseOptions}
              placeholder={st.labelWarehouse}
            />
          </Form.Item>
          <Form.Item name="note" label={st.labelNote}>
            <Input.TextArea rows={2} placeholder={st.notePh} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
