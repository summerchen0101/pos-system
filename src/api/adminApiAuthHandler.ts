import { isAdminPath } from './adminPathRules'

type Handlers = {
  onSessionLost: (from: string) => void | Promise<void>
  onForbidden: () => void
}

let handlers: Handlers | null = null
let sessionLostFiring = false

export function registerAdminApiAuthHandler(next: Handlers | null) {
  handlers = next
}

/**
 * 401：登入 / JWT 失效。僅在瀏覽器且位於 `/admin` 路徑時觸發（避免收銀台被導出）。
 * 內部防抖，避免平行請求重複導向。
 */
export function dispatchAdminSessionLost(): void {
  if (typeof window === 'undefined') return
  if (window.location.pathname.startsWith('/login')) return
  if (!isAdminPath(window.location.pathname)) return
  if (sessionLostFiring) return
  sessionLostFiring = true
  if (!handlers) {
    window.location.assign('/login')
    window.setTimeout(() => {
      sessionLostFiring = false
    }, 1500)
    return
  }
  const from = `${window.location.pathname}${window.location.search}`
  void Promise.resolve(handlers.onSessionLost(from)).finally(() => {
    window.setTimeout(() => {
      sessionLostFiring = false
    }, 1500)
  })
}

/**
 * 403：已識別身份但權限不足。僅提示，不登出、不導向登入。
 */
export function dispatchAdminForbidden(): void {
  if (typeof window === 'undefined' || !handlers) return
  if (!isAdminPath(window.location.pathname)) return
  handlers.onForbidden()
}

export function isAdminApiAuthHandlerRegistered(): boolean {
  return handlers != null
}
