import {
  App,
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { isAdminRole } from "../api/authProfile";
import { listBoothWarehouseStock, type BoothWarehouseStockLine } from "../api/inventoryBooth";
import {
  createStocktakeAdmin,
  deleteStocktakeDraftAdmin,
  listStocktakesAdmin,
  type StocktakeListEntry,
  type StocktakeStatus,
} from "../api/stocktakesAdmin";
import type { PosBoothOutletContext } from "../components/pos/PosBoothRoute";
import { PosBrandLogo } from "../components/pos/PosBrandLogo";
import "../components/pos/posBrand.css";
import { useAuth } from "../auth/AuthContext";
import { zhtw } from "../locales/zhTW";

const st = zhtw.admin.stocktakes;
const pst = zhtw.pos.stocktake;
const common = zhtw.common;

type FilterValues = {
  status?: StocktakeStatus | null;
  range?: [Dayjs, Dayjs] | null;
};

function stocktakeErrorMessage(raw: string): string {
  if (raw.includes("stocktake_draft_exists")) return st.draftExistsError;
  return raw || st.createError;
}

export function PosBoothStocktakesPage() {
  const { boothId } = useParams<{ boothId: string }>();
  const { entry } = useOutletContext<PosBoothOutletContext>();
  const { message, modal } = App.useApp();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const warehouseId = entry.warehouseId;

  const canUseBooth = Boolean(
    profile &&
      warehouseId &&
      (isAdminRole(profile.role) || profile.boothIds.includes(entry.id)),
  );

  const [filterForm] = Form.useForm<FilterValues>();
  const [createForm] = Form.useForm<{ note?: string }>();
  const [rows, setRows] = useState<StocktakeListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [stockLines, setStockLines] = useState<BoothWarehouseStockLine[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);

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
      const data = await listStocktakesAdmin({
        warehouseId,
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
  }, [canUseBooth, filterForm, message, warehouseId]);

  const loadStock = useCallback(async () => {
    if (!warehouseId || !canUseBooth) return;
    setStockLoading(true);
    setStockError(null);
    try {
      const lines = await listBoothWarehouseStock(warehouseId);
      setStockLines(lines);
    } catch (e) {
      setStockLines([]);
      setStockError(e instanceof Error ? e.message : pst.stockLoadError);
    } finally {
      setStockLoading(false);
    }
  }, [canUseBooth, warehouseId]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const openCreate = () => {
    createForm.resetFields();
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!warehouseId) return;
    try {
      const v = await createForm.validateFields();
      setCreating(true);
      const id = await createStocktakeAdmin({
        warehouseId,
        note: v.note?.trim() ? v.note.trim() : null,
      });
      message.success(st.createdOk);
      setCreateOpen(false);
      navigate(`/pos/${boothId}/stocktakes/${id}`);
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "";
      message.error(stocktakeErrorMessage(msg));
    } finally {
      setCreating(false);
    }
  };

  const onDeleteDraft = useCallback(
    (row: StocktakeListEntry) => {
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
    },
    [common.delete, fetchList, message, modal, st.createError, st.deleteBody, st.deleteTitle, st.deletedOk],
  );

  const stockColumns: ColumnsType<BoothWarehouseStockLine> = useMemo(
    () => [
      { title: pst.colCategory, key: "c", width: 120, render: (_, r) => r.categoryName ?? common.dash },
      { title: pst.colProduct, dataIndex: "productName", key: "p", ellipsis: true },
      {
        title: pst.colStock,
        dataIndex: "stock",
        key: "s",
        width: 100,
        align: "right",
      },
    ],
    [pst.colCategory, pst.colProduct, pst.colStock, common.dash],
  );

  const listColumns: ColumnsType<StocktakeListEntry> = useMemo(
    () => [
      {
        title: st.colCreatedAt,
        dataIndex: "createdAt",
        key: "c",
        width: 168,
        render: (iso: string) => dayjs(iso).format("YYYY-MM-DD HH:mm"),
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
                <Link to={`/pos/${boothId}/stocktakes/${r.id}`}>
                  <Button type="link" size="small">
                    {st.continue}
                  </Button>
                </Link>
                <Button type="link" size="small" danger onClick={() => onDeleteDraft(r)}>
                  {st.deleteDraft}
                </Button>
              </>
            ) : (
              <Link to={`/pos/${boothId}/stocktakes/${r.id}`}>
                <Button type="link" size="small">
                  {st.viewDetail}
                </Button>
              </Link>
            )}
          </Space>
        ),
      },
    ],
    [boothId, common.dash, onDeleteDraft, st],
  );

  const gateAlert =
    !warehouseId ? (
      <Alert type="warning" showIcon message={pst.noWarehouseTitle} description={pst.noWarehouseBody} />
    ) : profile && !canUseBooth ? (
      <Alert type="error" showIcon message={pst.forbiddenTitle} description={pst.forbiddenBody} />
    ) : null;

  return (
    <div className="pos-brand-shell">
      <div className="pos-brand-shell__inner pos-brand-shell__inner--wide">
        <PosBrandLogo height={48} className="pos-brand-logo-wrap" />
        <Typography.Title level={4} style={{ margin: "0 0 8px", color: "var(--pos-brand-text)", width: "100%" }}>
          {pst.pageTitle}
        </Typography.Title>
        <Typography.Text type="secondary" style={{ display: "block", marginBottom: 16, width: "100%" }}>
          {entry.name}
        </Typography.Text>

        {gateAlert}

        {canUseBooth && warehouseId ? (
          <>
            <Space style={{ marginBottom: 16, width: "100%", justifyContent: "space-between" }} wrap>
              <Link to={`/pos/${boothId}`}>
                <Button type="link" style={{ paddingLeft: 0 }}>
                  ← {pst.backBoothHome}
                </Button>
              </Link>
              <Button type="primary" onClick={openCreate}>
                {st.newStocktake}
              </Button>
            </Space>

            <Tabs
              defaultActiveKey="stocktakes"
              style={{ width: "100%", textAlign: "left" }}
              items={[
                {
                  key: "stocktakes",
                  label: pst.tabStocktakes,
                  children: (
                    <>
                      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                        {pst.stocktakesHint}
                      </Typography.Paragraph>
                      <Card style={{ marginBottom: 16, background: "var(--pos-brand-surface)" }}>
                        <Form form={filterForm} layout="vertical">
                          <Space wrap size="middle" align="start">
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
                      <Card style={{ background: "var(--pos-brand-surface)" }}>
                        <Table<StocktakeListEntry>
                          rowKey="id"
                          loading={loading}
                          columns={listColumns}
                          dataSource={rows}
                          pagination={{ pageSize: 12 }}
                          scroll={{ x: 640 }}
                        />
                      </Card>
                    </>
                  ),
                },
                {
                  key: "stock",
                  label: pst.tabCurrentStock,
                  children: (
                    <>
                      <Space style={{ marginBottom: 12 }}>
                        <Button onClick={() => void loadStock()} loading={stockLoading}>
                          {pst.refreshStock}
                        </Button>
                      </Space>
                      {stockError ? (
                        <Typography.Text type="danger">{stockError}</Typography.Text>
                      ) : (
                        <Card style={{ background: "var(--pos-brand-surface)" }}>
                          <Table<BoothWarehouseStockLine>
                            rowKey="productId"
                            loading={stockLoading}
                            columns={stockColumns}
                            dataSource={stockLines}
                            pagination={{ pageSize: 20 }}
                            scroll={{ x: 480 }}
                          />
                        </Card>
                      )}
                    </>
                  ),
                },
              ]}
              onChange={(key) => {
                if (key === "stock" && stockLines.length === 0 && !stockLoading && !stockError) void loadStock();
              }}
            />
          </>
        ) : null}

        <Modal
          title={st.modalCreateTitle}
          open={createOpen}
          onCancel={() => setCreateOpen(false)}
          onOk={() => void submitCreate()}
          confirmLoading={creating}
          destroyOnClose
          okText={common.save}>
          <Form form={createForm} layout="vertical" style={{ marginTop: 8 }}>
            <Typography.Text type="secondary">{pst.createNoteOnly}</Typography.Text>
            <Form.Item name="note" label={st.labelNote} style={{ marginTop: 12 }}>
              <Input.TextArea rows={2} placeholder={st.notePh} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </div>
  );
}
