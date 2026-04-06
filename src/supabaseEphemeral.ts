import { createClient } from '@supabase/supabase-js'
import type { Database } from './types/supabase'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Short-lived Supabase client (in-memory auth). Use for one-off sign-in (e.g. 換班打卡)
 * so the main browser session in `supabase.ts` is never replaced.
 */
export function createEphemeralSupabaseClient() {
  const mem = new Map<string, string>()
  return createClient<Database>(url ?? '', anonKey ?? '', {
    auth: {
      storage: {
        getItem: (key) => mem.get(key) ?? null,
        setItem: (key, value) => {
          mem.set(key, value)
        },
        removeItem: (key) => {
          mem.delete(key)
        },
      },
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
