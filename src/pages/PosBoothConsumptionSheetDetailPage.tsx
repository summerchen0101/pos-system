import {
  App,
  Button,
  Card,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { isAdminRole } from "../api/authProfile";
import {
  deleteCompletedConsumptionSheetAdmin,
  getConsumptionSheetDetailAdmin,
  type ConsumptionSheetDetail,
  type ConsumptionSheetLineDetail,
} from "../api/consumptionSheetsAdmin";
import type { PosBoothOutletContext } from "../components/pos/PosBoothRoute";
import { PosBrandLogo } from "../components/pos/PosBrandLogo";
import "../components/pos/pos.css";
import "../components/pos/posBrand.css";
import { useAuth } from "../auth/AuthContext";
import { zhtw } from "../locales/zhTW";

const { Title, Text } = Typography;
const cs = zhtw.admin.consumptionSheets;
const pst = zhtw.pos.consumptionSheet;
const common = zhtw.common;

export function PosBoothConsumptionSheetDetailPage() {
  const { boothId, consumptionSheetId } = useParams<{
    boothId: string;
    consumptionSheetId: string;
  }>();
  const { entry } = useOutletContext<PosBoothOutletContext>();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { profile } = useAuth();

  const canEdit = Boolean(
    profile &&
      entry.warehouseId &&
      (isAdminRole(profile.role) || profile.boothIds.includes(entry.id)),
  );

  const [detail, setDetail] = useState<ConsumptionSheetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!consumptionSheetId) return;
    setLoading(true);
    try {
      const d = await getConsumptionSheetDetailAdmin(consumptionSheetId);
      setDetail(d);
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

  useEffect(() => {
    if (!detail || !entry.warehouseId) return;
    if (detail.warehouseId !== entry.warehouseId && profile && !isAdminRole(profile.role)) {
      message.warning(pst.wrongWarehouse);
      navigate(`/pos/${boothId}/consumption-sheets`, { replace: true });
    }
  }, [boothId, detail, entry.warehouseId, message, navigate, profile]);

  const canDelete = useMemo(
    () =>
      Boolean(canEdit && detail && detail.status === "completed" && detail.warehouseId === entry.warehouseId),
    [canEdit, detail, entry.warehouseId],
  );

  const detailMissingOrInvalid = detail && detail.status !== "completed";

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

  const listHref = `/pos/${boothId}/consumption-sheets`;

  const onDelete = () => {
    if (!consumptionSheetId || !detail) return;
    modal.confirm({
      title: cs.deleteCompletedTitle,
      content: cs.deleteCompletedBody,
      okText: common.delete,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          setDeleting(true);
          await deleteCompletedConsumptionSheetAdmin(consumptionSheetId);
          message.success(cs.deletedOk);
          navigate(listHref, { replace: true });
        } catch (err) {
          const raw = err instanceof Error ? err.message : "";
          if (raw.includes("forbidden")) message.error(pst.submitForbidden);
          else if (raw.includes("consumption_sheet_not_found")) message.error(cs.loadError);
          else message.error(err instanceof Error ? err.message : cs.createError);
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  if (!consumptionSheetId || !boothId) {
    return <Text type="secondary">Invalid id</Text>;
  }

  if (loading && !detail) {
    return (
      <div className="pos-brand-shell">
        <div className="pos-brand-shell__inner">
          <Card loading />
        </div>
      </div>
    );
  }

  return (
    <div className="pos-brand-shell">
      <div className="pos-brand-shell__inner pos-brand-shell__inner--wide">
        <PosBrandLogo height={44} className="pos-brand-logo-wrap" />
        <Space style={{ marginBottom: 16 }} wrap>
          <Link to={listHref}>
            <Button type="link" style={{ paddingLeft: 0 }}>
              ← {pst.backSheetList}
            </Button>
          </Link>
          {canDelete ? (
            <Button danger loading={deleting} onClick={onDelete}>
              {cs.deleteDraft}
            </Button>
          ) : null}
        </Space>
        {detailMissingOrInvalid ? (
          <Text type="secondary">{cs.detailInvalid}</Text>
        ) : detail ? (
          <>
            <Title level={4} style={{ marginTop: 0, color: "var(--pos-brand-text)" }}>
              {cs.detailTitle}
              {detail.warehouseName ? ` · ${detail.warehouseName}` : ""}
            </Title>
            <Space wrap style={{ marginBottom: 12 }}>
              <Text type="secondary">
                {cs.detailCreatedAtLabel}：
                {dayjs(detail.createdAt).format("YYYY-MM-DD HH:mm")}
              </Text>
            </Space>
            {detail.note ? (
              <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                {cs.labelNote}：{detail.note}
              </Text>
            ) : null}
            <Card style={{ background: "var(--pos-brand-surface)" }}>
              <Table<ConsumptionSheetLineDetail>
                rowKey="id"
                loading={loading}
                columns={readColumns}
                dataSource={detail.lines}
                pagination={{ pageSize: 30 }}
                scroll={{ x: 900 }}
              />
            </Card>
          </>
        ) : (
          <Text type="secondary">{cs.loadError}</Text>
        )}
      </div>
    </div>
  );
}
