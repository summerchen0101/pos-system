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
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { isAdminRole } from "../api/authProfile";
import {
  createConsumptionSheetAdmin,
  deleteConsumptionDraftAdmin,
  listConsumptionSheetsAdmin,
  type ConsumptionSheetListEntry,
  type ConsumptionSheetStatus,
} from "../api/consumptionSheetsAdmin";
import type { PosBoothOutletContext } from "../components/pos/PosBoothRoute";
import { PosBrandLogo } from "../components/pos/PosBrandLogo";
import "../components/pos/posBrand.css";
import { useAuth } from "../auth/AuthContext";
import { zhtw } from "../locales/zhTW";

const cs = zhtw.admin.consumptionSheets;
const pst = zhtw.pos.consumptionSheet;
const common = zhtw.common;

type FilterValues = {
  status?: ConsumptionSheetStatus | null;
  range?: [Dayjs, Dayjs] | null;
};

function createErrorMessage(raw: string): string {
  if (raw.includes("forbidden")) return pst.submitForbidden;
  return raw || cs.createError;
}

export function PosBoothConsumptionSheetsPage() {
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
  const [createForm] = Form.useForm<{ note?: string; consumptionDate?: Dayjs | null }>();
  const [rows, setRows] = useState<ConsumptionSheetListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

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
  }, [canUseBooth, filterForm, message, warehouseId]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ consumptionDate: dayjs() });
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!warehouseId) return;
    try {
      const v = await createForm.validateFields();
      setCreating(true);
      const id = await createConsumptionSheetAdmin({
        warehouseId,
        note: v.note?.trim() ? v.note.trim() : null,
        consumptionDate: v.consumptionDate ? v.consumptionDate.format("YYYY-MM-DD") : null,
      });
      message.success(cs.createdOk);
      setCreateOpen(false);
      navigate(`/pos/${boothId}/consumption-sheets/${id}`);
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

  const onDeleteDraft = useCallback(
    (row: ConsumptionSheetListEntry) => {
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
    },
    [common.delete, cs.createError, cs.deleteBody, cs.deleteTitle, cs.deletedOk, fetchList, message, modal],
  );

  const listColumns: ColumnsType<ConsumptionSheetListEntry> = useMemo(
    () => [
      {
        title: cs.colConsumptionDate,
        dataIndex: "consumptionDate",
        key: "cd",
        width: 112,
      },
      {
        title: cs.colCreatedAt,
        dataIndex: "createdAt",
        key: "c",
        width: 156,
        render: (iso: string) => dayjs(iso).format("YYYY-MM-DD HH:mm"),
      },
      {
        title: cs.colLastEditedAt,
        dataIndex: "lastEditedAt",
        key: "u",
        width: 156,
        render: (iso: string) => dayjs(iso).format("YYYY-MM-DD HH:mm"),
      },
      {
        title: cs.colStatus,
        dataIndex: "status",
        key: "s",
        width: 92,
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
        width: 100,
        render: (_, r) => r.createdByName ?? common.dash,
      },
      {
        title: cs.colActions,
        key: "a",
        width: 180,
        render: (_, r) => (
          <Space size={0} wrap>
            {r.status === "draft" ? (
              <>
                <Link to={`/pos/${boothId}/consumption-sheets/${r.id}`}>
                  <Button type="link" size="small">
                    {cs.editSheet}
                  </Button>
                </Link>
                <Button type="link" size="small" danger onClick={() => onDeleteDraft(r)}>
                  {cs.deleteDraft}
                </Button>
              </>
            ) : (
              <Link to={`/pos/${boothId}/consumption-sheets/${r.id}`}>
                <Button type="link" size="small">
                  {cs.viewDetail}
                </Button>
              </Link>
            )}
          </Space>
        ),
      },
    ],
    [boothId, common.dash, cs, onDeleteDraft],
  );

  const gateAlert = !warehouseId ? (
    <Alert type="warning" showIcon message={pst.noWarehouseTitle} description={pst.noWarehouseBody} />
  ) : profile && !canUseBooth ? (
    <Alert type="error" showIcon message={pst.forbiddenTitle} description={pst.forbiddenBody} />
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
                {cs.newSheet}
              </Button>
            </Space>

            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              {pst.sheetsHint}
            </Typography.Paragraph>

            <Card style={{ marginBottom: 16, background: "var(--pos-brand-surface)" }}>
              <Form form={filterForm} layout="vertical">
                <Space wrap size="middle" align="start">
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
          okText={common.save}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            {pst.createNoteOnly}
          </Typography.Paragraph>
          <Form form={createForm} layout="vertical">
            <Form.Item name="consumptionDate" label={cs.labelConsumptionDate}>
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="note" label={cs.labelNote}>
              <Input.TextArea rows={2} placeholder={cs.notePh} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </div>
  );
}
