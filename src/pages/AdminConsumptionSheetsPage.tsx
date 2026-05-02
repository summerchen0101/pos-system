import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  canManageStocktakeForWarehouse,
  isAdminRole,
} from "../api/authProfile";
import {
  CONSUMPTION_KINDS,
  deleteCompletedConsumptionSheetAdmin,
  listConsumptionSheetsAdmin,
  submitConsumptionSheetAdmin,
  type ConsumptionKind,
  type ConsumptionSheetListEntry,
} from "../api/consumptionSheetsAdmin";
import {
  listProductIdsWithPositiveStock,
  listWarehousesAdmin,
} from "../api/inventoryAdmin";
import { ProductSelect } from "../components/admin/ProductSelect";
import { DateRangeQuickButtons } from "../components/DateRangeQuickButtons";
import { useAuth } from "../auth/AuthContext";
import { zhtw } from "../locales/zhTW";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { duplicateLineProductRule } from "../lib/consumptionFormRules";

const { Title, Text } = Typography;
const cs = zhtw.admin.consumptionSheets;
const inv = zhtw.admin.inventory;
const common = zhtw.common;

const CONSUMPTION_CREATE_MODAL_WIDTH = 920;
const LINE_PRODUCT_SELECT_WIDTH = 420;

type FilterValues = {
  warehouseId?: string | null;
  range?: [Dayjs, Dayjs] | null;
};

type LineForm = {
  productId?: string;
  quantity?: number;
};

type CreateForm = {
  warehouseId: string;
  kind: ConsumptionKind;
  note?: string;
  lines: LineForm[];
};

function createSubmitErrorMessage(raw: string): string {
  if (raw.includes("forbidden")) return cs.submitForbidden;
  if (raw.includes("invalid_consumption_kind")) return cs.submitError;
  if (raw.includes("invalid_lines_payload")) return cs.submitError;
  if (raw.includes("consumption_sheet_empty")) return cs.emptySubmitError;
  if (raw.includes("insufficient_stock")) return inv.insufficientStock;
  return raw || cs.createError;
}

export function AdminConsumptionSheetsPage() {
  const { message, modal } = App.useApp();
  const { profile } = useAuth();
  const admin = profile ? isAdminRole(profile.role) : false;
  const canCreate = Boolean(
    profile && (admin || profile.managedWarehouseIds.length > 0),
  );
  const [filterForm] = Form.useForm<FilterValues>();
  const [createForm] = Form.useForm<CreateForm>();
  const [rows, setRows] = useState<ConsumptionSheetListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [warehouseOptions, setWarehouseOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [inStockProductIds, setInStockProductIds] = useState<
    Set<string> | "loading" | null
  >(null);
  const prevCreateWarehouseRef = useRef<string | undefined>(undefined);

  const createWarehouseId = Form.useWatch("warehouseId", createForm);

  const kindOptions = useMemo(
    () =>
      CONSUMPTION_KINDS.map((k) => ({
        value: k,
        label: cs.kinds[k],
      })),
    [],
  );

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

  const applyFilterRangeAndFetch = useCallback(
    (range: [Dayjs, Dayjs]) => {
      filterForm.setFieldsValue({ range });
      queueMicrotask(() => void fetchList());
    },
    [filterForm, fetchList],
  );

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

  useEffect(() => {
    if (!createOpen) return;
    const wh = createWarehouseId;
    const prev = prevCreateWarehouseRef.current;
    if (prev !== undefined && wh !== undefined && prev !== wh) {
      createForm.setFieldsValue({ lines: [{ quantity: 1 }] });
    }
    prevCreateWarehouseRef.current = wh;
  }, [createForm, createOpen, createWarehouseId]);

  useEffect(() => {
    if (!createOpen || !createWarehouseId) {
      setInStockProductIds(null);
      return;
    }
    let cancelled = false;
    setInStockProductIds("loading");
    void listProductIdsWithPositiveStock(createWarehouseId)
      .then((ids) => {
        if (!cancelled) setInStockProductIds(ids);
      })
      .catch(() => {
        if (!cancelled) {
          message.error(cs.loadError);
          setInStockProductIds(new Set());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen, createWarehouseId, message]);

  const openCreate = () => {
    prevCreateWarehouseRef.current = undefined;
    createForm.resetFields();
    createForm.setFieldsValue({
      kind: "tasting",
      lines: [{ quantity: 1 }],
    });
    setInStockProductIds(null);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    try {
      const v = await createForm.validateFields();
      const linesIn = v.lines ?? [];
      const lines = linesIn
        .map((ln) => ({
          productId: (ln.productId ?? "").trim(),
          quantity: Math.max(0, Math.trunc(Number(ln.quantity) || 0)),
        }))
        .filter((ln) => ln.productId.length > 0 && ln.quantity > 0);
      if (lines.length === 0) {
        message.error(cs.emptySubmitError);
        return;
      }
      setCreating(true);
      const res = await submitConsumptionSheetAdmin({
        warehouseId: v.warehouseId,
        kind: v.kind,
        note: v.note?.trim() ? v.note.trim() : null,
        consumptionDate: null,
        lines,
      });
      message.success(cs.submitSuccess(res.deducted_lines, res.total_qty));
      setCreateOpen(false);
      await fetchList();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: string }).message)
          : "";
      message.error(createSubmitErrorMessage(msg));
    } finally {
      setCreating(false);
    }
  };

  const onDeleteCompleted = (row: ConsumptionSheetListEntry) => {
    modal.confirm({
      title: cs.deleteCompletedTitle,
      content: cs.deleteCompletedBody,
      okText: common.delete,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteCompletedConsumptionSheetAdmin(row.id);
          message.success(cs.deletedOk);
          await fetchList();
        } catch (err) {
          const raw = err instanceof Error ? err.message : "";
          if (raw.includes("forbidden")) message.error(cs.submitForbidden);
          else if (raw.includes("consumption_sheet_not_completed"))
            message.error(cs.loadError);
          else
            message.error(err instanceof Error ? err.message : cs.createError);
        }
      },
    });
  };

  const columns: ColumnsType<ConsumptionSheetListEntry> = [
    {
      title: cs.colListCreatedDate,
      dataIndex: "createdAt",
      key: "c",
      width: 168,
      render: (iso: string) => dayjs(iso).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: cs.colKind,
      key: "k",
      width: 100,
      render: (_, r) => (r.kind ? cs.kinds[r.kind] : common.dash),
    },
    {
      title: cs.colListItems,
      dataIndex: "itemsSummary",
      key: "items",
      ellipsis: true,
      render: (s: string) => (s?.trim() ? s : common.dash),
    },
    {
      title: cs.colActions,
      key: "a",
      width: 220,
      render: (_, r) => (
        <Space size={0} wrap>
          <Link to={`/admin/inventory/consumption-sheets/${r.id}`}>
            <Button type="link" size="small">
              {cs.viewDetail}
            </Button>
          </Link>
          {profile && canManageStocktakeForWarehouse(profile, r.warehouseId) ? (
            <Button
              type="link"
              size="small"
              danger
              onClick={() => onDeleteCompleted(r)}>
              {cs.deleteDraft}
            </Button>
          ) : null}
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
            <Form.Item
              name="warehouseId"
              label={cs.filterWarehouse}
              style={{ marginBottom: 0 }}>
              <Select
                allowClear
                placeholder={cs.filterAllWarehouses}
                style={{ minWidth: 200 }}
                options={scopedWarehouseOptions}
              />
            </Form.Item>
            <Form.Item
              label={cs.filterRange}
              style={{ marginBottom: 0 }}>
              <Space wrap align="start">
                <DateRangeQuickButtons onChange={applyFilterRangeAndFetch} />
                <Form.Item name="range" noStyle>
                  <DatePicker.RangePicker />
                </Form.Item>
              </Space>
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
        width={CONSUMPTION_CREATE_MODAL_WIDTH}
        okText={cs.submitConfirm}>
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
          <Form.Item name="note" label={cs.labelNote}>
            <Input.TextArea rows={2} placeholder={cs.notePh} />
          </Form.Item>
          <Form.Item
            name="kind"
            label={cs.labelKind}
            rules={[{ required: true, message: common.required }]}>
            <Select options={kindOptions} placeholder={cs.labelKind} />
          </Form.Item>
          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...rest }) => (
                  <Space
                    key={key}
                    align="baseline"
                    style={{ display: "flex", marginBottom: 8 }}
                    wrap>
                    <Form.Item
                      {...rest}
                      name={[name, "productId"]}
                      dependencies={["lines"]}
                      rules={[
                        { required: true, message: common.required },
                        duplicateLineProductRule(cs.duplicateProductInLines),
                      ]}
                      style={{
                        width: LINE_PRODUCT_SELECT_WIDTH,
                        marginBottom: 0,
                      }}>
                      <ProductSelect
                        style={{ width: LINE_PRODUCT_SELECT_WIDTH }}
                        dropdownStyle={{ minWidth: LINE_PRODUCT_SELECT_WIDTH }}
                        popupMatchSelectWidth={false}
                        disabled={!createWarehouseId}
                        placeholder={
                          createWarehouseId
                            ? cs.colProduct
                            : cs.pickWarehouseFirst
                        }
                        restrictToProductIds={
                          createWarehouseId
                            ? (inStockProductIds ?? "loading")
                            : undefined
                        }
                      />
                    </Form.Item>
                    <Form.Item
                      {...rest}
                      name={[name, "quantity"]}
                      rules={[{ required: true, message: common.required }]}
                      style={{ width: 120, marginBottom: 0 }}>
                      <InputNumber
                        min={1}
                        precision={0}
                        style={{ width: "100%" }}
                        placeholder={cs.colQty}
                      />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(name)} />
                  </Space>
                ))}
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button
                    type="dashed"
                    onClick={() => add({ quantity: 1 })}
                    block
                    icon={<PlusOutlined />}>
                    {cs.addLine}
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
}
