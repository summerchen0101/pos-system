import { supabase } from "../supabase";
import { fetchActiveStaffNamesForBooth } from "./posActiveStaff";

/** Today’s shift roster for the booth (Taipei date); anon RPC. */
export async function fetchScheduledStaffNamesForBooth(boothId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("pos_list_scheduled_staff_names", {
    p_booth_id: boothId,
  });
  if (error) throw error;
  if (data == null) return [];
  return Array.isArray(data) ? data : [];
}

/** Scheduled + currently clocked-in names at checkout time (POS anon). */
export async function fetchCheckoutStaffSnapshots(
  boothId: string,
): Promise<{ scheduledStaff: string[]; clockedInStaff: string[] }> {
  const [scheduledStaff, clockedInStaff] = await Promise.all([
    fetchScheduledStaffNamesForBooth(boothId),
    fetchActiveStaffNamesForBooth(boothId),
  ]);
  return { scheduledStaff, clockedInStaff };
}
