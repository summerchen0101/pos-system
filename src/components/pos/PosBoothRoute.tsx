import { Spin } from "antd";
import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useParams } from "react-router-dom";
import { fetchBoothPosEntry, type PosBoothEntry } from "../../api/boothsPos";
import { zhtw } from "../../locales/zhTW";
import { isBoothPinVerifiedInSession } from "../../lib/boothPinSession";
import { BoothPinScreen } from "./BoothPinScreen";
import { PosBrandLogo } from "./PosBrandLogo";
import "./posBrand.css";

export type PosBoothOutletContext = {
  entry: PosBoothEntry;
};

type Phase = "loading" | "invalid" | "pin" | "ready";

export function PosBoothRoute() {
  const { boothId } = useParams<{ boothId: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [entry, setEntry] = useState<PosBoothEntry | null>(null);
  const [pinEpoch, setPinEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!boothId) {
        setEntry(null);
        setPhase("invalid");
        return;
      }

      setPhase("loading");
      try {
        const e = await fetchBoothPosEntry(boothId);
        if (cancelled) return;
        if (!e) {
          setEntry(null);
          setPhase("invalid");
          return;
        }
        const needPin =
          e.pin != null && e.pin.length > 0 && !isBoothPinVerifiedInSession(boothId);
        if (needPin) {
          setEntry(e);
          setPhase("pin");
          return;
        }
        setEntry(e);
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setEntry(null);
          setPhase("invalid");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [boothId, pinEpoch]);

  const onPinVerified = useCallback(() => setPinEpoch((n) => n + 1), []);

  if (phase === "loading" && boothId) {
    return (
      <div className="pos-brand-loading">
        <Spin size="large" />
      </div>
    );
  }

  if (phase === "invalid" || !boothId) {
    return (
      <div className="pos-brand-shell">
        <div className="pos-brand-shell__inner">
          <PosBrandLogo height={48} className="pos-brand-logo-wrap" />
          <h1 className="pos-brand-error-title">{zhtw.pos.boothInvalidTitle}</h1>
          <p className="pos-brand-error-hint">{zhtw.pos.boothInvalidHint}</p>
          <Link className="pos-brand-error-link" to="/">
            {zhtw.pos.boothHome.backToBoothList}
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "pin" && entry?.pin) {
    return (
      <BoothPinScreen
        boothId={boothId}
        boothName={entry.name}
        expectedPin={entry.pin}
        onVerified={onPinVerified}
      />
    );
  }

  if (phase === "ready" && entry) {
    return <Outlet context={{ entry } as PosBoothOutletContext} />;
  }

  return (
    <div className="pos-brand-loading">
      <Spin size="large" />
    </div>
  );
}
