/**
 * Error contract: backend (Edge + PostgREST) and client handlers.
 *
 * - 401: 未帶/無法驗證 JWT、或工作階段失效。
 * - 403: 身份可辨識但角色/範圍不足（或 RLS 拒絕寫入/讀取敏感列）。
 *
 * 前端（僅在 `/admin` 路徑下）：401 → 登出並導向 /login；403 → 僅提示，不登出。
 */

/** Edge / manage-users JSON `code` values that map to HTTP 401. */
export const EDGE_UNAUTHORIZED_CODES = ['NO_AUTH', 'INVALID_SESSION'] as const
export type EdgeUnauthorizedCode = (typeof EDGE_UNAUTHORIZED_CODES)[number]

/** Edge / manage-users JSON `code` values that map to HTTP 403. */
export const EDGE_FORBIDDEN_CODES = ['FORBIDDEN'] as const
export type EdgeForbiddenCode = (typeof EDGE_FORBIDDEN_CODES)[number]

export function isEdgeUnauthorizedCode(
  code: string,
): code is EdgeUnauthorizedCode {
  return (EDGE_UNAUTHORIZED_CODES as readonly string[]).includes(code)
}

export function isEdgeForbiddenCode(code: string): code is EdgeForbiddenCode {
  return (EDGE_FORBIDDEN_CODES as readonly string[]).includes(code)
}

/**
 * PostgREST / GoTrue 錯誤是否視為需重新登入（401 語意）。
 * 保守比對，避免把一般網路錯誤當成登出。
 */
export function isSupabaseErrorUnauthorized(err: { message?: string; status?: number } | null | undefined): boolean {
  if (!err) return false
  if (err.status === 401) return true
  const m = (err.message ?? '').toLowerCase()
  if (m.includes('jwt') && (m.includes('expired') || m.includes('invalid'))) return true
  if (m.includes('invalid refresh token')) return true
  if (m === 'unauthorized' || m.includes('401')) return true
  return false
}

/**
 * 已登入但存取被據（RLS 或 policies）。PostgREST 常見 403 或 42501。
 */
export function isSupabaseErrorForbidden(err: { message?: string; status?: number; code?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.status === 403) return true
  if (err.code === '42501') return true
  const m = (err.message ?? '').toLowerCase()
  if (m.includes('permission denied') || m.includes('row-level security')) return true
  if (m.includes('403')) return true
  return false
}
