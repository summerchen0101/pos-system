/**
 * RLS 盤點（對照 `supabase/migrations/*_migrate_rbac.sql`、`*_migrate_manager_role*.sql` 等；以部署中的 migration 為準）。
 *
 * 原則：後台寫入多數需 `is_admin()`；`MANAGER` 另由 migrate_manager_role 擴充讀/寫
 * 班表、打卡、可見的 STAFF 等。STAFF 與攤位範圍以 `current_user_booth_ids()` 限制。
 *
 * | 資源 / 行為 | ADMIN | MANAGER | STAFF (已登入) |
 * |---|---|---|---|
 * | users 讀同列或 admin 讀全 | 全 | 可見可見的 STAFF（政策） | 自己 |
 * | user_booths 寫 | admin | 依政策 | 無 |
 * | categories/products 等主檔 SELECT | 是（RLS: 全站已登入可讀，供 POS 共用） | 同 | 同 |
 * | 主檔寫入 | is_admin 政策 | 依專屬政策 | 無 |
 * | booths 讀 | 指派的或 admin；寫入 admin | 依政策 | 依政策 |
 * | orders 讀 | admin 或所屬攤 | 攤位範圍內 | 攤位範圍內 |
 * | 盤點寫入 | is_admin 或攤位倉庫（`create_stocktake` / `complete_stocktake` 內 `user_may_manage_stocktake_warehouse`） | 同 | 同 |
 * | 多數 RPC (checkout 等) | 內建 booth / uid 檢查 | 依各版 migration | 收銀路徑 |
 *
 * 缺口處理：新表或新 RPC 必須一併補上 policy 或 security definer 內角色檢查，否則僅能依賴 service role/Edge。
 *
 * 前端：`adminPathRules` 路徑權限 + `supabase` 自訂 fetch 對 PostgREST/Edge 401/403
 * 觸發 `adminApiAuthHandler`（不取代 RLS）。
 *
 * 我的班表（`MyShiftsPage` → `shifts`）：`shifts_select` 見 `supabase/migrations/*_migrate_manager_role.sql`。
 * STAFF 可讀 (1) `user_id = auth.uid()` 的列 (2) `booth_id in current_user_booth_ids()`（`user_booths`）。
 * 部署須已套用該遷移；若店員只看得到自己、看不到同攤同事，請在 DB 或後台使用者管理確認
 * 該帳號的 `user_booths` 是否包含排班所屬 `booth_id`。
 *
 * 班表卡片姓名：`listShiftsInRange` 嵌套 `users(name)`；除 `users_select_same_booth` 外，
 * `users_select_shift_roster_at_my_booths`（`supabase/migrations/*_migrate_users_select_shift_roster.sql`）允許 STAFF/MANAGER
 * 讀取在「自己所屬攤位」`shifts` 上出現過的使用者列。`shifts_select` 須以 `is_staff_or_manager()`
 * 取代對 `users` 的 inline subquery（見 `supabase/migrations/*_migrate_manager_role.sql`），否則 `users` roster policy
 * 在檢查 `shifts` 可見性時會 users → shifts → users 而 42P17。
 */

export {}
