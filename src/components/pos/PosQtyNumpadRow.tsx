import { useState } from "react";
import { NumpadModal } from "../NumpadModal";

type Props = {
  value: number;
  min: number;
  max: number;
  numpadTitle: string;
  onChange: (v: number) => void;
  className?: string;
};

/**
 * － / ＋ 直接增減；點擊中間數字開啟 {@link NumpadModal}（POS 平板友善）。
 */
export function PosQtyNumpadRow({
  value,
  min,
  max,
  numpadTitle,
  onChange,
  className,
}: Props) {
  const [numpadOpen, setNumpadOpen] = useState(false);
  const v = Math.max(min, Math.min(max, Math.trunc(value)));

  const handleMinus = () => {
    onChange(Math.max(min, v - 1));
  };

  const handlePlus = () => {
    onChange(Math.min(max, v + 1));
  };

  return (
    <>
      <div className={className ?? "pos-qty-numpad-row"}>
        <button
          type="button"
          className="pos-qty-numpad-row__btn"
          onClick={handleMinus}
          disabled={v <= min}
        >
          －
        </button>
        <button
          type="button"
          className="pos-qty-numpad-row__value"
          onClick={() => setNumpadOpen(true)}
        >
          {v}
        </button>
        <button
          type="button"
          className="pos-qty-numpad-row__btn"
          onClick={handlePlus}
          disabled={v >= max}
        >
          ＋
        </button>
      </div>
      <NumpadModal
        open={numpadOpen}
        title={numpadTitle}
        value={v}
        min={min}
        max={max}
        onConfirm={(q) => {
          onChange(Math.max(min, Math.min(max, Math.trunc(q))));
          setNumpadOpen(false);
        }}
        onCancel={() => setNumpadOpen(false)}
      />
    </>
  );
}
