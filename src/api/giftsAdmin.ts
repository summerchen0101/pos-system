import { supabase } from "../supabase";

const giftSelect = `
  id,
  name,
  is_active,
  gift_inventory ( stock )
`;

export type AdminGift = {
  id: string;
  name: string;
  isActive: boolean;
  stock: number;
};

type GiftRowRaw = {
  id: string;
  name: string;
  is_active: boolean;
  gift_inventory?: { stock: number } | { stock: number }[] | null;
};

function firstGiftInv(
  x: { stock: number } | { stock: number }[] | null | undefined,
): { stock: number } | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function mapGiftRow(row: GiftRowRaw): AdminGift {
  const inv = firstGiftInv(row.gift_inventory);
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    stock: inv?.stock ?? 0,
  };
}

export async function listGiftsAdmin(): Promise<AdminGift[]> {
  const { data, error } = await supabase
    .from("gifts")
    .select(giftSelect)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r) => mapGiftRow(r as GiftRowRaw));
}

export type GiftCreateInput = {
  name: string;
  isActive: boolean;
  initialStock: number;
};

export async function getGiftById(id: string): Promise<AdminGift> {
  const { data, error } = await supabase
    .from("gifts")
    .select(giftSelect)
    .eq("id", id)
    .single();
  if (error) throw error;
  return mapGiftRow(data as GiftRowRaw);
}

export async function createGift(input: GiftCreateInput): Promise<AdminGift> {
  const { data, error } = await supabase
    .from("gifts")
    .insert({
      name: input.name.trim(),
      is_active: input.isActive,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("No id returned");

  const { error: invErr } = await supabase.from("gift_inventory").insert({
    gift_id: data.id,
    stock: Math.max(0, Math.trunc(input.initialStock)),
  });
  if (invErr) throw invErr;

  return getGiftById(data.id);
}

export async function updateGift(
  id: string,
  patch: { name?: string; isActive?: boolean },
): Promise<AdminGift> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (Object.keys(row).length > 0) {
    const { error } = await supabase.from("gifts").update(row).eq("id", id);
    if (error) throw error;
  }
  return getGiftById(id);
}

export async function setGiftStock(
  giftId: string,
  stock: number,
): Promise<void> {
  const s = Math.max(0, Math.trunc(stock));
  const { error } = await supabase
    .from("gift_inventory")
    .upsert({ gift_id: giftId, stock: s }, { onConflict: "gift_id" });
  if (error) throw error;
}
