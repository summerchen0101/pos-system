import { Spin, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listBoothsForPos } from "../api/boothsPos";
import { PosBrandLogo } from "../components/pos/PosBrandLogo";
import "../components/pos/posBrand.css";
import { zhtw } from "../locales/zhTW";

const t = zhtw.pos.home;
const common = zhtw.common;

export function PosHomePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booths, setBooths] = useState<{ id: string; name: string; location: string | null }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await listBoothsForPos();
        if (!cancelled) setBooths(list);
      } catch (e) {
        if (!cancelled) {
          setBooths([]);
          setError(e instanceof Error ? e.message : common.requestFailed);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="pos-brand-shell">
      <div className="pos-brand-shell__inner" style={{ maxWidth: 480 }}>
        <PosBrandLogo height={64} className="pos-brand-logo-wrap" />
        <p className="pos-brand-name-en">{t.brandEn}</p>
        <h1 className="pos-brand-name-zh">{t.brandZh}</h1>
        <div className="pos-brand-divider" role="separator" />
        <p className="pos-brand-section-label">{t.chooseBooth}</p>

        {loading ? (
          <div style={{ padding: "2rem 0" }}>
            <Spin />
          </div>
        ) : error ? (
          <Typography.Text type="danger">{t.loadError}</Typography.Text>
        ) : booths.length === 0 ? (
          <Typography.Text style={{ color: "var(--pos-brand-muted)" }}>
            {zhtw.pos.boothPicker.empty}
          </Typography.Text>
        ) : (
          <div className="pos-brand-booth-grid">
            {booths.map((b) => (
              <Link key={b.id} to={`/pos/${b.id}`} className="pos-brand-booth-card">
                <h2 className="pos-brand-booth-card__name">{b.name}</h2>
                {b.location?.trim() ? (
                  <p className="pos-brand-booth-card__loc">{b.location.trim()}</p>
                ) : null}
              </Link>
            ))}
          </div>
        )}

        <div className="pos-brand-footer-link">
          <Link to="/admin">{t.adminLink}</Link>
        </div>
      </div>
    </div>
  );
}
