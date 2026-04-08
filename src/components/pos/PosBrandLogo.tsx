import { useCallback, useState } from "react";

type Props = {
  height: number;
  className?: string;
  fallbackText?: string;
};

export function PosBrandLogo({ height, className, fallbackText = "N&C" }: Props) {
  const [showImg, setShowImg] = useState(true);

  const onError = useCallback(() => {
    setShowImg(false);
  }, []);

  return (
    <div className={className} style={{ height, minWidth: height }}>
      {showImg ? (
        <img
          src="/logo.png"
          alt=""
          height={height}
          width="auto"
          style={{ height, width: "auto", objectFit: "contain", display: "block" }}
          onError={onError}
        />
      ) : (
        <span className="pos-brand-logo-fallback">{fallbackText}</span>
      )}
    </div>
  );
}
