import { Button, Modal, Spin, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { taipeiTodayIso } from "../api/clockLogsReport";
import {
  listPosPublicShiftsForDay,
  type PosPublicShiftRow,
} from "../api/posBoothShiftsPublic";
import type { PosBoothOutletContext } from "../components/pos/PosBoothRoute";
import { PosBrandLogo } from "../components/pos/PosBrandLogo";
import "../components/pos/posBrand.css";
import { zhtw } from "../locales/zhTW";

const t = zhtw.pos.boothHome;

export function PosBoothHomePage() {
  const { entry } = useOutletContext<PosBoothOutletContext>();
  const navigate = useNavigate();
  const [shiftsOpen, setShiftsOpen] = useState(false);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [shiftsError, setShiftsError] = useState<string | null>(null);
  const [shiftRows, setShiftRows] = useState<PosPublicShiftRow[]>([]);

  const loadShifts = useCallback(async () => {
    setShiftsLoading(true);
    setShiftsError(null);
    try {
      const rows = await listPosPublicShiftsForDay(entry.id, taipeiTodayIso());
      setShiftRows(rows);
    } catch (e) {
      setShiftRows([]);
      setShiftsError(e instanceof Error ? e.message : t.shiftsLoadError);
    } finally {
      setShiftsLoading(false);
    }
  }, [entry.id]);

  const openShifts = useCallback(() => {
    setShiftsOpen(true);
    void loadShifts();
  }, [loadShifts]);

  const columns: ColumnsType<PosPublicShiftRow> = useMemo(
    () => [
      { title: t.shiftColName, dataIndex: "user_name", key: "user_name" },
      {
        title: t.shiftColKind,
        dataIndex: "shift_note",
        key: "shift_note",
        render: (note: string | null) => (note?.trim() ? note.trim() : t.shiftNoteDash),
      },
      { title: t.shiftColTime, dataIndex: "time_range", key: "time_range" },
      { title: t.shiftColClock, dataIndex: "clock_status", key: "clock_status" },
    ],
    [t.shiftColClock, t.shiftColKind, t.shiftColName, t.shiftColTime, t.shiftNoteDash],
  );

  const loc = entry.location?.trim();

  return (
    <div className="pos-brand-shell">
      <div className="pos-brand-shell__inner">
        <PosBrandLogo height={56} className="pos-brand-logo-wrap" />
        <h1 className="pos-brand-booth-title">{entry.name}</h1>
        {loc ? <p className="pos-brand-booth-loc">{loc}</p> : null}
        <div className="pos-brand-divider" role="separator" />

        <div className="pos-brand-actions">
          <button type="button" className="pos-brand-btn-primary" onClick={() => navigate("cashier")}>
            {t.enterCashier}
          </button>
          <button type="button" className="pos-brand-btn-outline" onClick={openShifts}>
            {t.todayShifts}
          </button>
        </div>

        <p className="pos-brand-back-link">
          <Link to="/">{t.back}</Link>
        </p>
      </div>

      <Modal
        title={t.todayShiftsTitle}
        open={shiftsOpen}
        onCancel={() => setShiftsOpen(false)}
        footer={
          <Button type="primary" onClick={() => setShiftsOpen(false)}>
            {t.modalClose}
          </Button>
        }
        width={640}
        destroyOnClose>
        {shiftsLoading ? (
          <div style={{ textAlign: "center", padding: 32 }}>
            <Spin />
          </div>
        ) : shiftsError ? (
          <Typography.Text type="danger">{shiftsError}</Typography.Text>
        ) : shiftRows.length === 0 ? (
          <Typography.Text type="secondary">{t.shiftsEmpty}</Typography.Text>
        ) : (
          <Table<PosPublicShiftRow>
            size="small"
            rowKey={(row, i) => `${row.user_name}-${row.time_range}-${i}`}
            columns={columns}
            dataSource={shiftRows}
            pagination={false}
          />
        )}
      </Modal>
    </div>
  );
}
