import { createClient } from '@supabase/supabase-js'
import { dispatchAdminForbidden, dispatchAdminSessionLost } from './api/adminApiAuthHandler'
import { isAdminPath } from './api/adminPathRules'
import type { Database } from './types/supabase'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Add them to .env and restart the dev server.',
  )
}

const nativeFetch: typeof fetch = globalThis.fetch.bind(globalThis)

/** On `/admin`, map PostgREST / Edge 401/403 到登出或權限提示。 */
function supabaseAuthAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return nativeFetch(input, init).then((res) => {
    if (typeof window === 'undefined' || !url) return res
    const u =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String((input as URL).href)
    if (!u.startsWith(url)) return res
    let pathname = ''
    try {
      pathname = new URL(u, url).pathname
    } catch {
      return res
    }
    const isRest = pathname.startsWith('/rest/v1')
    const isFn = pathname.startsWith('/functions/v1')
    if (!isRest && !isFn) return res
    if (!isAdminPath(window.location.pathname)) return res
    if (res.status === 401) {
      dispatchAdminSessionLost()
    } else if (res.status === 403) {
      dispatchAdminForbidden()
    }
    return res
  })
}

export const supabase = createClient<Database>(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    detectSessionInUrl: true,
  },
  global: {
    fetch: supabaseAuthAwareFetch,
  },
})
