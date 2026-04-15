import { supabase } from '../supabase'
import { listProductsForInventory } from './inventoryAdmin'

export type BoothWarehouseStockLine = {
  productId: string
  productName: string
  categoryName: string | null
  stock: number
}

/** Current on-hand quantities for one warehouse (RLS: booth-assigned staff). */
export async function listBoothWarehouseStock(warehouseId: string): Promise<BoothWarehouseStockLine[]> {
  const products = await listProductsForInventory()
  const { data: inv, error } = await supabase
    .from('inventory')
    .select('product_id, stock')
    .eq('warehouse_id', warehouseId)
  if (error) throw error
  const byPid = new Map<string, number>()
  for (const r of inv ?? []) {
    byPid.set(r.product_id as string, r.stock as number)
  }
  return products.map((p) => ({
    productId: p.id,
    productName: p.name,
    categoryName: p.categoryName,
    stock: byPid.get(p.id) ?? 0,
  }))
}
