import { bundleGroupRequiredQty, componentQtySumForBundleGroup } from "./bundleCart";
import { isFreeSelectionCartLine } from "../promotions/freeSelectionLines";
import type { CartLine, Product, Promotion } from "../types/pos";

/** Min/max quantity for a cart line when editing via numpad (+ quick ±1). */
export function getLineQtyBounds(
  line: CartLine,
  lines: readonly CartLine[],
  products: readonly Product[],
  promotions: readonly Promotion[],
): { min: number; max: number } {
  const min = 1;
  if (line.isGift) {
    const gs = line.giftStock ?? 0;
    return { min, max: Math.max(min, gs) };
  }
  if (line.isBundleRoot) {
    return { min: line.quantity, max: line.quantity };
  }
  if (
    line.isBundleComponent &&
    line.bundleRootProductId &&
    line.bundleInstanceId &&
    line.bundleGroupId
  ) {
    const bundle = products.find((x) => x.id === line.bundleRootProductId);
    if (!bundle || bundle.kind !== "CUSTOM_BUNDLE") {
      return { min, max: Math.max(min, line.product.stock) };
    }
    const required = bundleGroupRequiredQty(bundle, line.bundleGroupId);
    const sumOthers = componentQtySumForBundleGroup(
      lines,
      line.bundleInstanceId,
      line.bundleGroupId,
      line.lineId,
    );
    const rowMax = Math.min(
      line.product.stock,
      Math.max(0, required - sumOthers),
    );
    return { min, max: Math.max(min, rowMax) };
  }
  if (isFreeSelectionCartLine(line, promotions)) {
    const p = promotions.find((x) => x.id === line.manualPromotionId);
    if (!p || p.kind !== "FREE_SELECTION") {
      return { min, max: Math.max(min, line.product.stock) };
    }
    const maxPromo = p.maxSelectionQty ?? 0;
    const totalOthers = lines
      .filter(
        (l) =>
          l.isManualFree &&
          l.manualPromotionId === p.id &&
          l.lineId !== line.lineId &&
          !l.isBundleComponent,
      )
      .reduce((a, l) => a + l.quantity, 0);
    const rowMax = Math.min(
      line.product.stock,
      Math.max(0, maxPromo - totalOthers),
    );
    return { min, max: Math.max(min, rowMax) };
  }
  return { min, max: Math.max(min, line.product.stock) };
}
