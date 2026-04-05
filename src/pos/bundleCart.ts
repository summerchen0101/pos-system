import type { CartLine, Product } from '../types/pos'

export function bundleComponentLineId(instanceId: string, groupId: string, productId: string): string {
  return `bundlecomp:${instanceId}:${groupId}:${productId}`
}

export function bundleRootLineId(instanceId: string): string {
  return `bundleroot:${instanceId}`
}

export function isBundleComponentLine(line: CartLine): boolean {
  return !!line.isBundleComponent
}

export function isBundleRootLine(line: CartLine): boolean {
  return !!line.isBundleRoot
}

export function linesInBundleInstance(lines: readonly CartLine[], instanceId: string): CartLine[] {
  return lines.filter((l) => l.bundleInstanceId === instanceId)
}

export function componentQtySumForBundle(
  lines: readonly CartLine[],
  instanceId: string,
  excludeLineId?: string,
): number {
  return lines
    .filter(
      (l) =>
        l.bundleInstanceId === instanceId &&
        l.isBundleComponent &&
        (!excludeLineId || l.lineId !== excludeLineId),
    )
    .reduce((a, l) => a + l.quantity, 0)
}

/** Sum quantities for one bundle group within an instance. */
export function componentQtySumForBundleGroup(
  lines: readonly CartLine[],
  instanceId: string,
  groupId: string,
  excludeLineId?: string,
): number {
  return lines
    .filter(
      (l) =>
        l.bundleInstanceId === instanceId &&
        l.isBundleComponent &&
        l.bundleGroupId === groupId &&
        (!excludeLineId || l.lineId !== excludeLineId),
    )
    .reduce((a, l) => a + l.quantity, 0)
}

export function bundleGroupRequiredQty(bundle: Product, groupId: string): number {
  return bundle.bundleGroups.find((g) => g.id === groupId)?.requiredQty ?? 0
}
