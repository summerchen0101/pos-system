import {
  App,
  Button,
  Card,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { canManageStocktakeForWarehouse } from "../api/authProfile";
import {
  completeConsumptionSheetAdmin,
  CONSUMPTION_KINDS,
  type ConsumptionKind,
  getConsumptionSheetDetailAdmin,
  saveConsumptionSheetLinesAdmin,
  type ConsumptionSheetDetail,
  type ConsumptionSheetLineDetail,
} from "../api/consumptionSheetsAdmin";
import { useAuth } from "../auth/AuthContext";
import { ProductSelect } from "../components/admin/ProductSelect";
import { zhtw } from "../locales/zhTW";

const { Title, Text } = Typography;
const cs = zhtw.admin.consumptionSheets;
const inv = zhtw.admin.inventory;
const common = zhtw.common;

type DraftRow = {
  key: string;
  productId: string;
  kind: ConsumptionKind;
  quantity: number;
  note: string;
};

function linesFromDetail(d: ConsumptionSheetDetail): DraftRow[] {
  return d.lines.map((ln) => ({
    key: ln.id,
    productId: ln.productId,
    kind: ln.kind,
    quantity: ln.quantity,
    note: ln.note ?? "",
  }));
}

function emptyRow(): DraftRow {
  return {
    key: crypto.randomUUID(),
    productId: "",
    kind: "tasting",
    quantity: 1,
    note: "",
  };
}

function saveErrorMessage(raw: string): string {
  if (raw.includes("forbidden")) return cs.submitForbidden;
  if (raw.includes("consumption_sheet_not_draft")) return cs.submitError;
  if (raw.includes("consumption_sheet_not_found")) return cs.loadError;
  return raw || cs.saveError;
}

function submitErrorMessage(raw: string): string {
  if (raw.includes("forbidden")) return cs.submitForbidden;
  if (raw.includes("consumption_sheet_not_draft")) return cs.submitError;
  if (raw.includes("consumption_sheet_empty")) return cs.emptySubmitError;
  if (raw.includes("insufficient_stock")) return inv.insufficientStock;
  return raw || cs.submitError;
}

export function AdminConsumptionSheetDetailPage() {
  const { consumptionSheetId } = useParams<{ consumptionSheetId: string }>();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { profile } = useAuth();

  const [detail, setDetail] = useState<ConsumptionSheetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveDoneOpen, setSaveDoneOpen] = useState(false);

  const load = useCallback(async () => {
    if (!consumptionSheetId) return;
    setLoading(true);
    try {
      const d = await getConsumptionSheetDetailAdmin(consumptionSheetId);
      setDetail(d);
      if (d?.status === "draft") {
        setDraftRows(d.lines.length > 0 ? linesFromDetail(d) : [emptyRow()]);
      } else {
        setDraftRows([]);
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : cs.loadError);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [consumptionSheetId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const canEdit = useMemo(
    () =>
      Boolean(
        profile &&
        detail &&
        canManageStocktakeForWarehouse(profile, detail.warehouseId),
      ),
    [profile, detail],
  );

  const kindOptions = useMemo(
    () =>
      CONSUMPTION_KINDS.map((k) => ({
        value: k,
        label: cs.kinds[k],
      })),
    [],
  );

  const buildPayload = useCallback(() => {
    const valid = draftRows.filter((r) => r.productId.trim().length > 0);
    return valid.map((r) => ({
      productId: r.productId,
      kind: r.kind,
      quantity: Math.max(0, Math.trunc(Number(r.quantity) || 0)),
      note: r.note?.trim() ? r.note.trim() : null,
    }));
  }, [draftRows]);

  const validateDraftForSubmit = (): boolean => {
    for (const r of draftRows) {
      if (!r.productId.trim()) continue;
      const q = Math.trunc(Number(r.quantity) || 0);
      if (q < 0 || Number.isNaN(q)) {
        message.error(cs.invalidLinesError);
        return false;
      }
    }
    const payload = buildPayload();
    const positive = payload.filter((p) => p.quantity > 0);
    if (positive.length === 0) {
      message.error(cs.emptySubmitError);
      return false;
    }
    return true;
  };

  const runSave = async () => {
    if (!detail || detail.status !== "draft" || !consumptionSheetId || !canEdit)
      return;
    for (const r of draftRows) {
      if (!r.productId.trim()) continue;
      const q = Math.trunc(Number(r.quantity) || 0);
      if (q < 0 || Number.isNaN(q)) {
        message.error(cs.invalidLinesError);
        return;
      }
    }
    try {
      setSaving(true);
      await saveConsumptionSheetLinesAdmin(consumptionSheetId, buildPayload());
      await load();
      setSaveDoneOpen(true);
    } catch (e) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: string }).message)
          : "";
      message.error(saveErrorMessage(msg));
    } finally {
      setSaving(false);
    }
  };

  const runComplete = async () => {
    if (!detail || detail.status !== "draft" || !consumptionSheetId || !canEdit)
      return;
    if (!validateDraftForSubmit()) return;
    try {
      setSubmitting(true);
      await saveConsumptionSheetLinesAdmin(consumptionSheetId, buildPayload());
      const res = await completeConsumptionSheetAdmin(consumptionSheetId);
      message.success(cs.submitSuccess(res.deducted_lines, res.total_qty));
      await load();
    } catch (e) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: string }).message)
          : "";
      message.error(submitErrorMessage(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = () => {
    if (!canEdit || !detail || detail.status !== "draft") return;
    modal.confirm({
      title: cs.submitConfirm,
      okText: cs.submitConfirm,
      cancelText: common.cancel,
      onOk: () => void runComplete(),
    });
  };

  const updateRow = (key: string, patch: Partial<DraftRow>) => {
    setDraftRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  };

  const removeRow = (key: string) => {
    setDraftRows((prev) =>
      prev.length <= 1 ? prev : prev.filter((r) => r.key !== key),
    );
  };

  const draftColumns: ColumnsType<DraftRow> = useMemo(
    () => [
      {
        title: cs.colProduct,
        key: "p",
        minWidth: 300,
        render: (_, r) => (
          <ProductSelect
            style={{ width: "100%" }}
            value={r.productId || undefined}
            onChange={(v) =>
              updateRow(r.key, { productId: typeof v === "string" ? v : "" })
            }
          />
        ),
      },
      {
        title: cs.colKind,
        key: "k",
        width: 140,
        render: (_, r) => (
          <Select
            style={{ width: "100%" }}
            options={kindOptions}
            value={r.kind}
            onChange={(v) => updateRow(r.key, { kind: v as ConsumptionKind })}
          />
        ),
      },
      {
        title: cs.colQty,
        key: "q",
        width: 120,
        render: (_, r) => (
          <InputNumber
            min={0}
            precision={0}
            style={{ width: "100%" }}
            value={r.quantity}
            onChange={(v) =>
              updateRow(r.key, { quantity: typeof v === "number" ? v : 0 })
            }
          />
        ),
      },
      {
        title: cs.colLineNote,
        key: "n",
        width: 200,
        render: (_, r) => (
          <Input
            value={r.note}
            placeholder={cs.notePh}
            onChange={(e) => updateRow(r.key, { note: e.target.value })}
          />
        ),
      },
      {
        title: cs.colActions,
        key: "a",
        width: 88,
        render: (_, r) => (
          <Button
            type="link"
            danger
            size="small"
            onClick={() => removeRow(r.key)}>
            {cs.removeLine}
          </Button>
        ),
      },
    ],
    [kindOptions],
  );

  const readColumns: ColumnsType<ConsumptionSheetLineDetail> = useMemo(
    () => [
      { title: cs.colProduct, key: "p", render: (_, r) => r.productName },
      {
        title: cs.colKind,
        key: "k",
        width: 120,
        render: (_, r) => cs.kinds[r.kind],
      },
      {
        title: cs.colQty,
        dataIndex: "quantity",
        key: "q",
        width: 100,
        align: "right",
      },
      {
        title: cs.colLineNote,
        dataIndex: "note",
        key: "n",
        ellipsis: true,
        render: (n: string | null) => n?.trim() || common.dash,
      },
    ],
    [],
  );

  if (!consumptionSheetId) {
    return <Text type="secondary">Invalid id</Text>;
  }

  if (loading && !detail) {
    return (
      <div className="admin-page">
        <Card loading />
      </div>
    );
  }

  return (
    <div className="admin-page">
      <Space style={{ marginBottom: 16 }}>
        <Link to="/admin/inventory/consumption-sheets">
          <Button type="link" style={{ paddingLeft: 0 }}>
            ← {cs.backToList}
          </Button>
        </Link>
      </Space>
      {detail ? (
        <>
          <Title level={4} style={{ marginTop: 0 }}>
            {cs.detailTitle}
            {detail.warehouseName ? ` · ${detail.warehouseName}` : ""}
          </Title>
          <Space wrap style={{ marginBottom: 12 }}>
            <Text type="secondary">
              {cs.labelConsumptionDate}：{detail.consumptionDate}
            </Text>
            <Text type="secondary">
              {detail.status === "draft" ? cs.statusDraft : cs.statusCompleted}
              {detail.completedAt
                ? ` · ${dayjs(detail.completedAt).format("YYYY-MM-DD HH:mm")}`
                : ""}
            </Text>
            {detail.status === "completed" ? (
              <Text type="secondary">{cs.readOnlyHint}</Text>
            ) : null}
            {detail.status === "draft" && !canEdit ? (
              <Text type="warning">{cs.draftNotInScope}</Text>
            ) : null}
          </Space>
          {detail.note ? (
            <Text
              type="secondary"
              style={{ display: "block", marginBottom: 12 }}>
              {cs.labelNote}：{detail.note}
            </Text>
          ) : null}
          <Card>
            {detail.status === "draft" && canEdit ? (
              <Table<DraftRow>
                rowKey="key"
                loading={loading}
                columns={draftColumns}
                dataSource={draftRows}
                pagination={false}
                scroll={{ x: 1080 }}
              />
            ) : (
              <Table<ConsumptionSheetLineDetail>
                rowKey="id"
                loading={loading}
                columns={readColumns}
                dataSource={detail.lines}
                pagination={{ pageSize: 30 }}
                scroll={{ x: 900 }}
              />
            )}
          </Card>
          {detail.status === "draft" && canEdit ? (
            <Space style={{ marginTop: 16 }} wrap>
              <Button
                onClick={() => setDraftRows((prev) => [...prev, emptyRow()])}>
                {cs.addLine}
              </Button>
              <Button loading={saving} onClick={() => void runSave()}>
                {cs.saveProgress}
              </Button>
              <Button type="primary" loading={submitting} onClick={onSubmit}>
                {cs.submitConfirm}
              </Button>
            </Space>
          ) : null}
          <Modal
            title={cs.saveSuccessTitle}
            open={saveDoneOpen}
            onCancel={() => setSaveDoneOpen(false)}
            footer={[
              <Button key="stay" onClick={() => setSaveDoneOpen(false)}>
                {cs.continueEdit}
              </Button>,
              <Button
                key="list"
                type="primary"
                onClick={() => {
                  setSaveDoneOpen(false);
                  navigate("/admin/inventory/consumption-sheets");
                }}>
                {cs.backToList}
              </Button>,
            ]}>
            <Text type="secondary">{cs.saveSuccessBody}</Text>
          </Modal>
        </>
      ) : (
        <Text type="secondary">{cs.loadError}</Text>
      )}
    </div>
  );
}
