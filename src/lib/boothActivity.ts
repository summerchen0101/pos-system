/** `YYYY-MM-DD` ISO date vs optional inclusive booth activity bounds. */
export function shiftDateOutsideBoothActivity(
  shiftDateIso: string,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): boolean {
  if (!startDate && !endDate) return false;
  if (startDate && shiftDateIso < startDate) return true;
  if (endDate && shiftDateIso > endDate) return true;
  return false;
}

/** Display label for warnings / table (slashes). Returns null if both bounds missing. */
export function formatBoothActivityRangeLabel(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): string | null {
  const fmt = (d: string) => d.replace(/-/g, "/");
  if (startDate && endDate) return `${fmt(startDate)} – ${fmt(endDate)}`;
  if (startDate) return `${fmt(startDate)} 起`;
  if (endDate) return `至 ${fmt(endDate)}`;
  return null;
}
