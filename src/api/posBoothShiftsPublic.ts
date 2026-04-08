import { supabase } from "../supabase";

export type PosPublicShiftRow = {
  user_name: string;
  shift_note: string | null;
  time_range: string;
  clock_status: string;
};

export async function listPosPublicShiftsForDay(
  boothId: string,
  dateIso: string,
): Promise<PosPublicShiftRow[]> {
  const { data, error } = await supabase.rpc("list_pos_public_shifts_for_day", {
    p_booth_id: boothId,
    p_date: dateIso,
  });
  if (error) throw error;
  if (data == null) return [];
  const arr = data as unknown;
  if (!Array.isArray(arr)) return [];
  return arr as PosPublicShiftRow[];
}
