import { App, Button, Card, Input, InputNumber, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { isAdminRole } from "../api/authProfile";
import {
  completeStocktakeAdmin,
  getStocktakeDetailAdmin,
  type StocktakeDetail,
  type StocktakeItemDetail,
} from "../api/stocktakesAdmin";
import type { PosBoothOutletContext } from "../components/pos/PosBoothRoute";
import { PosBrandLogo } from "../components/pos/PosBrandLogo";
import "../components/pos/posBrand.css";
import { useAuth } from "../auth/AuthContext";
import { zhtw } from "../locales/zhTW";

const { Title, Text } = Typography;
const st = zhtw.admin.stocktakes;
const pst = zhtw.pos.stocktake;
const common = zhtw.common;

type LineDraft = { actual: number | null; reason: string };

function diffStyle(d: number | null | undefined): CSSProperties | undefined {
  if (d == null) return undefined;
  if (d > 0) return { color: "#73d13d", fontWeight: 600 };
  if (d < 0) return { color: "#ff7875", fontWeight: 600 };
  return undefined;
}

function submitErrorMessage(raw: string): string {
  if (raw.includes("forbidden")) return pst.submitForbidden;
  if (raw.includes("stocktake_not_draft")) return st.submitError;
  return raw || st.submitError;
}

export function PosBoothStocktakeDetailPage() {
  const { boothId, stocktakeId } = useParams<{ boothId: string; stocktakeId: string }>();
  const { entry } = useOutletContext<PosBoothOutletContext>();
  const { message, modal } = App.useApp();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const canEdit = Boolean(
    profile &&
      entry.warehouseId &&
      (isAdminRole(profile.role) || profile.boothIds.includes(entry.id)),
  );

  const boothAccessDenied = Boolean(
    profile &&
      entry.warehouseId &&
      !isAdminRole(profile.role) &&
      !profile.boothIds.includes(entry.id),
  );

  const [detail, setDetail] = useState<StocktakeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<Record<string, LineDraft>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!stocktakeId) return;
    setLoading(true);
    try {
      const d = await getStocktakeDetailAdmin(stocktakeId);
      setDetail(d);
      if (d?.status === "draft") {
        const init: Record<string, LineDraft> = {};
        for (const it of d.items) {
          init[it.id] = {
            actual: it.actualStock ?? null,
            reason: it.reason ?? "",
          };
        }
        setLines(init);
      } else {
        setLines({});
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : st.loadError);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [message, stocktakeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detail || !entry.warehouseId) return;
    if (detail.warehouseId !== entry.warehouseId && profile && !isAdminRole(profile.role)) {
      message.warning(pst.wrongWarehouse);
      navigate(`/pos/${boothId}/stocktakes`, { replace: true });
    }
  }, [boothId, detail, entry.warehouseId, message, navigate, profile]);

  const countUnfilled = useMemo(() => {
    if (!detail || detail.status !== "draft") return 0;
    return detail.items.filter((it) => lines[it.id]?.actual === null || lines[it.id]?.actual === undefined).length;
  }, [detail, lines]);

  const runComplete = async () => {
    if (!detail || detail.status !== "draft" || !stocktakeId || !canEdit) return;
    try {
      setSubmitting(true);
      const payload = detail.items.map((it) => ({
        itemId: it.id,
        actualStock: lines[it.id]?.actual ?? null,
        reason: lines[it.id]?.reason?.trim() ? lines[it.id]!.reason.trim() : null,
      }));
      const res = await completeStocktakeAdmin(stocktakeId, payload);
      message.success(st.submitSuccess(res.adjusted_lines, res.increase_qty, res.decrease_qty));
      await load();
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "";
      message.error(submitErrorMessage(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = () => {
    if (!detail || detail.status !== "draft" || !canEdit) return;
    if (countUnfilled > 0) {
      modal.confirm({
        title: st.submitIncompleteTitle,
        content: st.submitIncompleteBody(countUnfilled),
        okText: st.submitConfirm,
        cancelText: common.cancel,
        onOk: () => void runComplete(),
      });
      return;
    }
    void runComplete();
  };

  const setLine = (itemId: string, patch: Partial<LineDraft>) => {
    setLines((prev) => ({
      ...prev,
      [itemId]: {
        actual: patch.actual !== undefined ? patch.actual : (prev[itemId]?.actual ?? null),
        reason: patch.reason !== undefined ? patch.reason : (prev[itemId]?.reason ?? ""),
      },
    }));
  };

  const draftColumns: ColumnsType<StocktakeItemDetail> = useMemo(() => {
    const cols: ColumnsType<StocktakeItemDetail> = [
      { title: st.colProduct, key: "p", render: (_, r) => r.productName },
      {
        title: st.colCategory,
        key: "c",
        width: 120,
        render: (_, r) => r.categoryName ?? common.dash,
      },
      {
        title: st.colSystem,
        dataIndex: "systemStock",
        key: "sys",
        width: 100,
        align: "right",
      },
    ];

    if (detail?.status === "draft" && canEdit) {
      cols.push({
        title: st.colActual,
        key: "act",
        width: 140,
        render: (_, r) => (
          <InputNumber
            min={0}
            precision={0}
            style={{ width: "100%" }}
            value={lines[r.id]?.actual ?? null}
            placeholder="—"
            onChange={(v) => setLine(r.id, { actual: v == null ? null : Number(v) })}
          />
        ),
      });
      cols.push({
        title: st.colDiff,
        key: "df",
        width: 100,
        align: "right",
        render: (_, r) => {
          const a = lines[r.id]?.actual;
          if (a == null) return common.dash;
          const d = a - r.systemStock;
          return <span style={diffStyle(d)}>{d > 0 ? `+${d}` : String(d)}</span>;
        },
      });
      cols.push({
        title: st.colReason,
        key: "rs",
        width: 200,
        render: (_, r) => (
          <Input
            value={lines[r.id]?.reason ?? ""}
            placeholder={st.notePh}
            onChange={(e) => setLine(r.id, { reason: e.target.value })}
          />
        ),
      });
    } else {
      cols.push({
        title: st.colActual,
        dataIndex: "actualStock",
        key: "act",
        width: 100,
        align: "right",
        render: (v: number | null) => (v == null ? common.dash : v),
      });
      cols.push({
        title: st.colDiff,
        dataIndex: "difference",
        key: "df",
        width: 100,
        align: "right",
        render: (v: number | null) => {
          if (v == null) return common.dash;
          return <span style={diffStyle(v)}>{v > 0 ? `+${v}` : String(v)}</span>;
        },
      });
      cols.push({
        title: st.colReason,
        dataIndex: "reason",
        key: "rs",
        ellipsis: true,
        render: (v: string | null) => v?.trim() || common.dash,
      });
    }

    return cols;
  }, [canEdit, detail?.status, lines, st, common.dash]);

  if (!stocktakeId || !boothId) {
    return <Text type="secondary">Invalid id</Text>;
  }

  if (loading && !detail) {
    return (
      <div className="pos-brand-shell">
        <div className="pos-brand-shell__inner pos-brand-shell__inner--wide">
          <Card loading style={{ width: "100%", background: "var(--pos-brand-surface)" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="pos-brand-shell">
      <div className="pos-brand-shell__inner pos-brand-shell__inner--wide">
        <PosBrandLogo height={40} className="pos-brand-logo-wrap" />
        <Space style={{ marginBottom: 12, width: "100%" }}>
          <Link to={`/pos/${boothId}/stocktakes`}>
            <Button type="link" style={{ paddingLeft: 0 }}>
              ← {pst.backStocktakeList}
            </Button>
          </Link>
        </Space>

        {!entry.warehouseId ? (
          <Text type="warning">{pst.noWarehouseTitle}</Text>
        ) : boothAccessDenied ? (
          <Text type="danger">{pst.forbiddenBody}</Text>
        ) : detail ? (
          <>
            <Title level={4} style={{ marginTop: 0, textAlign: "left", width: "100%" }}>
              {st.detailTitle}
              {detail.warehouseName ? ` · ${detail.warehouseName}` : ""}
            </Title>
            <Space wrap style={{ marginBottom: 12, width: "100%", justifyContent: "flex-start" }}>
              <Text type="secondary">
                {detail.status === "draft" ? st.statusDraft : st.statusCompleted}
                {detail.completedAt ? ` · ${dayjs(detail.completedAt).format("YYYY-MM-DD HH:mm")}` : ""}
              </Text>
              {detail.status === "completed" ? <Text type="secondary">{st.readOnlyHint}</Text> : null}
            </Space>
            {detail.note ? (
              <Text type="secondary" style={{ display: "block", marginBottom: 12, textAlign: "left", width: "100%" }}>
                {st.labelNote}：{detail.note}
              </Text>
            ) : null}
            <Card style={{ background: "var(--pos-brand-surface)" }}>
              <Table<StocktakeItemDetail>
                rowKey="id"
                loading={loading}
                columns={draftColumns}
                dataSource={detail.items}
                pagination={{ pageSize: 30 }}
                scroll={{ x: 900 }}
              />
            </Card>
            {detail.status === "draft" && canEdit ? (
              <Space style={{ marginTop: 16 }}>
                <Button type="primary" loading={submitting} onClick={onSubmit}>
                  {st.submitConfirm}
                </Button>
              </Space>
            ) : null}
          </>
        ) : (
          !loading && <Text type="secondary">{st.loadError}</Text>
        )}
      </div>
    </div>
  );
}
