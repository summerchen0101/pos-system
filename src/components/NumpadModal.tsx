import { Button, Modal } from "antd";
import { useEffect, useState } from "react";
import { zhtw } from "../locales/zhTW";
import "./NumpadModal.css";

const MAX_DIGITS = 6;

export type NumpadModalProps = {
  open: boolean;
  title: string;
  value: number;
  min?: number;
  max?: number;
  onConfirm: (value: number) => void;
  onCancel: () => void;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function NumpadModal({
  open,
  title,
  value,
  min = 0,
  max,
  onConfirm,
  onCancel,
}: NumpadModalProps) {
  const [draft, setDraft] = useState(() =>
    String(Math.max(0, Math.trunc(value))),
  );

  useEffect(() => {
    if (open) {
      setDraft(String(Math.max(0, Math.trunc(value))));
    }
  }, [open, value]);

  const displayNum =
    draft === "" ? 0 : Number.parseInt(draft, 10) || 0;
  const overMax = max != null && displayNum > max;
  const underMin = displayNum < min;
  const confirmDisabled = underMin || overMax;

  const appendDigit = (d: string) => {
    setDraft((prev) => {
      if (prev === "0") return d === "0" ? "0" : d;
      const next = prev + d;
      if (next.length > MAX_DIGITS) return prev;
      return next;
    });
  };

  const backspace = () => {
    setDraft((prev) => {
      if (prev.length <= 1) return "0";
      return prev.slice(0, -1);
    });
  };

  const clearDraft = () => setDraft("0");

  const stepBy = (delta: number) => {
    setDraft((prev) => {
      const n = prev === "" ? 0 : Number.parseInt(prev, 10) || 0;
      const hi = max ?? Number.MAX_SAFE_INTEGER;
      const next = clamp(n + delta, min, hi);
      return String(next);
    });
  };

  const hi = max ?? Number.MAX_SAFE_INTEGER;

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
      width={380}
      className="numpad-modal"
      centered
    >
      <div className="numpad-modal__body">
        <div className="numpad-display-wrap">
          <div
            className={`numpad-display${overMax ? " numpad-display--over" : ""}`}
          >
            {displayNum}
          </div>
        </div>

        <div className="numpad-step-row">
          <button
            type="button"
            className="numpad-key numpad-key--wide"
            onClick={() => stepBy(-1)}
            disabled={displayNum <= min}
            aria-label={zhtw.pos.numpadMinus}
          >
            －
          </button>
          <button
            type="button"
            className="numpad-key numpad-key--wide"
            onClick={() => stepBy(1)}
            disabled={displayNum >= hi}
            aria-label={zhtw.pos.numpadPlus}
          >
            ＋
          </button>
        </div>

        <div className="numpad-grid">
          {(["7", "8", "9", "4", "5", "6", "1", "2", "3"] as const).map(
            (d) => (
              <button
                key={d}
                type="button"
                className="numpad-key"
                onClick={() => appendDigit(d)}
              >
                {d}
              </button>
            ),
          )}
          <button
            type="button"
            className="numpad-key"
            onClick={clearDraft}
            aria-label={zhtw.pos.numpadClear}
          >
            {zhtw.pos.numpadClear}
          </button>
          <button
            type="button"
            className="numpad-key"
            onClick={() => appendDigit("0")}
          >
            0
          </button>
          <button
            type="button"
            className="numpad-key"
            onClick={backspace}
            aria-label={zhtw.pos.numpadBackspace}
          >
            ⌫
          </button>
        </div>

        <div className="numpad-footer">
          <Button onClick={onCancel}>{zhtw.common.cancel}</Button>
          <Button
            type="primary"
            disabled={confirmDisabled}
            onClick={() => onConfirm(displayNum)}
          >
            {zhtw.pos.numpadConfirm}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
