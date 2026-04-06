import { supabase } from "../supabase";

/** Today's open clock-ins for the booth (Taipei calendar); names sorted. */
export async function fetchActiveStaffNamesForBooth(boothId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("pos_list_active_staff_names", {
    p_booth_id: boothId,
  });
  if (error) throw error;
  if (data == null) return [];
  return Array.isArray(data) ? data : [];
}

export function formatPosActiveStaffLine(
  names: string[],
  prefix: string,
  dash: string,
  totalLabel: (n: number) => string,
): string {
  if (names.length === 0) return `${prefix}${dash}`;
  if (names.length <= 4) return `${prefix}${names.join("、")}`;
  return `${prefix}${names.slice(0, 3).join("、")}... ${totalLabel(names.length)}`;
}
