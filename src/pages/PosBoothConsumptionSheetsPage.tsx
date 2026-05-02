import {
  App,
  Alert,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { PlusOutlined, MinusCircleOutlined } from "@ant-design/icons";
import { duplicateLineProductRule } from "../lib/consumptionFormRules";
import { isAdminRole } from "../api/authProfile";
import { listProductIdsWithPositiveStock } from "../api/inventoryAdmin";
import {
  CONSUMPTION_KINDS,
  deleteCompletedConsumptionSheetAdmin,
  listConsumptionSheetsAdmin,
  submitConsumptionSheetAdmin,
  type ConsumptionKind,
  type ConsumptionSheetListEntry,
} from "../api/consumptionSheetsAdmin";
import type { PosBoothOutletContext } from "../components/pos/PosBoothRoute";
import { PosBrandLogo } from "../components/pos/PosBrandLogo";
import { ProductSelect } from "../components/admin/ProductSelect";
import { DateRangeQuickButtons } from "../components/DateRangeQuickButtons";
import "../components/pos/posBrand.css";
import { useAuth } from "../auth/AuthContext";
import { zhtw } from "../locales/zhTW";

const cs = zhtw.admin.consumptionSheets;
const pst = zhtw.pos.consumptionSheet;
const inv = zhtw.admin.inventory;
const common = zhtw.common;

const CONSUMPTION_CREATE_MODAL_WIDTH = 920;
const LINE_PRODUCT_SELECT_WIDTH = 420;

type FilterValues = {
  range?: [Dayjs, Dayjs] | null;
};

type LineForm = {
  productId?: string;
  quantity?: number;
};

type CreateForm = {
  kind: ConsumptionKind;
  note?: string;
  lines: LineForm[];
};

function createSubmitErrorMessage(raw: string): string {
  if (raw.includes("forbidden")) return pst.submitForbidden;
  if (raw.includes("consumption_sheet_empty")) return cs.emptySubmitError;
  if (raw.includes("insufficient_stock")) return inv.insufficientStock;
  return raw || cs.createError;
}

export function PosBoothConsumptionSheetsPage() {
  const { boothId } = useParams<{ boothId: string }>();
  const { entry } = useOutletContext<PosBoothOutletContext>();
  const { message, modal } = App.useApp();
  const { profile } = useAuth();
  const warehouseId = entry.warehouseId;

  const canUseBooth = Boolean(
    profile &&
    warehouseId &&
    (isAdminRole(profile.role) || profile.boothIds.includes(entry.id)),
  );

  const [filterForm] = Form.useForm<FilterValues>();
  const [createForm] = Form.useForm<CreateForm>();
  const [rows, setRows] = useState<ConsumptionSheetListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [inStockProductIds, setInStockProductIds] = useState<
    Set<string> | "loading" | null
  >(null);

  const kindOptions = useMemo(
    () =>
      CONSUMPTION_KINDS.map((k) => ({
        value: k,
        label: cs.kinds[k],
      })),
    [],
  );

  const fetchList = useCallback(async () => {
    if (!warehouseId || !canUseBooth) return;
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
        warehouseId,
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
  }, [canUseBooth, filterForm, message, warehouseId]);

  const applyFilterRangeAndFetch = useCallback(
    (range: [Dayjs, Dayjs]) => {
      filterForm.setFieldsValue({ range });
      queueMicrotask(() => void fetchList());
    },
    [filterForm, fetchList],
  );

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!createOpen || !warehouseId) {
      setInStockProductIds(null);
      return;
    }
    let cancelled = false;
    setInStockProductIds("loading");
    void listProductIdsWithPositiveStock(warehouseId)
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
  }, [createOpen, warehouseId, message]);

  const openCreate = () => {
    setInStockProductIds(null);
    createForm.resetFields();
    createForm.setFieldsValue({
      kind: "tasting",
      lines: [{ quantity: 1 }],
    });
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!warehouseId) return;
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
        warehouseId,
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

  const onDeleteCompleted = useCallback(
    (row: ConsumptionSheetListEntry) => {
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
            if (raw.includes("forbidden")) message.error(pst.submitForbidden);
            else
              message.error(
                err instanceof Error ? err.message : cs.createError,
              );
          }
        },
      });
    },
    [
      common.delete,
      cs.createError,
      cs.deleteCompletedBody,
      cs.deleteCompletedTitle,
      cs.deletedOk,
      fetchList,
      message,
      modal,
      pst.submitForbidden,
    ],
  );

  const listColumns: ColumnsType<ConsumptionSheetListEntry> = useMemo(
    () => [
      {
        title: cs.colListCreatedDate,
        dataIndex: "createdAt",
        key: "c",
        width: 156,
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
        width: 200,
        render: (_, r) => (
          <Space size={0} wrap>
            <Link to={`/pos/${boothId}/consumption-sheets/${r.id}`}>
              <Button type="link" size="small">
                {cs.viewDetail}
              </Button>
            </Link>
            <Button
              type="link"
              size="small"
              danger
              onClick={() => onDeleteCompleted(r)}>
              {cs.deleteDraft}
            </Button>
          </Space>
        ),
      },
    ],
    [boothId, common.dash, cs, onDeleteCompleted],
  );

  const gateAlert = !warehouseId ? (
    <Alert
      type="warning"
      showIcon
      message={pst.noWarehouseTitle}
      description={pst.noWarehouseBody}
    />
  ) : profile && !canUseBooth ? (
    <Alert
      type="error"
      showIcon
      message={pst.forbiddenTitle}
      description={pst.forbiddenBody}
    />
  ) : null;

  return (
    <div className="pos-brand-shell">
      <div className="pos-brand-shell__inner pos-brand-shell__inner--wide">
        <PosBrandLogo height={48} className="pos-brand-logo-wrap" />
        <Typography.Title
          level={4}
          style={{
            margin: "0 0 8px",
            color: "var(--pos-brand-text)",
            width: "100%",
          }}>
          {pst.pageTitle}
        </Typography.Title>
        <Typography.Text
          type="secondary"
          style={{ display: "block", marginBottom: 16, width: "100%" }}>
          {entry.name}
        </Typography.Text>

        {gateAlert}

        {canUseBooth && warehouseId ? (
          <>
            <Space
              style={{
                marginBottom: 16,
                width: "100%",
                justifyContent: "space-between",
              }}
              wrap>
              <Link to={`/pos/${boothId}`}>
                <Button type="link" style={{ paddingLeft: 0 }}>
                  ← {pst.backBoothHome}
                </Button>
              </Link>
              <Button type="primary" onClick={openCreate}>
                {cs.newSheet}
              </Button>
            </Space>

            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              {pst.sheetsHint}
            </Typography.Paragraph>

            <Card
              style={{
                marginBottom: 16,
                background: "var(--pos-brand-surface)",
              }}>
              <Form form={filterForm} layout="vertical">
                <Space wrap size="middle" align="start">
                  <Form.Item label={cs.filterRange} style={{ marginBottom: 0 }}>
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
            <Card style={{ background: "var(--pos-brand-surface)" }}>
              <Table<ConsumptionSheetListEntry>
                rowKey="id"
                loading={loading}
                columns={listColumns}
                dataSource={rows}
                pagination={{ pageSize: 12 }}
              />
            </Card>
          </>
        ) : null}

        <Modal
          title={cs.modalCreateTitle}
          open={canUseBooth && createOpen}
          onCancel={() => setCreateOpen(false)}
          onOk={() => void submitCreate()}
          confirmLoading={creating}
          destroyOnClose
          width={CONSUMPTION_CREATE_MODAL_WIDTH}
          okText={cs.submitConfirm}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            {pst.createNoteOnly}
          </Typography.Paragraph>
          <Form form={createForm} layout="vertical">
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
                          dropdownStyle={{
                            minWidth: LINE_PRODUCT_SELECT_WIDTH,
                          }}
                          popupMatchSelectWidth={false}
                          placeholder={cs.colProduct}
                          restrictToProductIds={
                            warehouseId
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
    </div>
  );
}
