import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchUserProfile, type UserProfile } from '../api/authProfile'
import { supabase } from '../supabase'
import { zhtw } from '../locales/zhTW'

type AuthContextValue = {
  session: Session | null
  profile: UserProfile | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s?.user) {
      setProfile(null)
      return
    }
    try {
      const p = await fetchUserProfile()
      setProfile(p)
    } catch {
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (cancelled) return
      setSession(s ?? null)
      void loadProfile(s ?? null).finally(() => {
        if (!cancelled) setLoading(false)
      })
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      void loadProfile(s)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (username: string, password: string) => {
    const u = username.trim()
    const invalid = (): never => {
      throw new Error(zhtw.auth.loginInvalidCredentials)
    }
    if (!u) invalid()

    const { data: emailData, error: rpcErr } = await supabase.rpc('get_auth_email_by_username', {
      p_username: u,
    })
    if (rpcErr) invalid()
    if (typeof emailData !== 'string' || emailData.length === 0) invalid()

    const loginEmail = emailData as string

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    })
    if (error) invalid()
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    await loadProfile(session)
  }, [loadProfile, session])

  const value: AuthContextValue = {
    session,
    profile,
    loading,
    signIn,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Paired with `AuthProvider` in this module; split would duplicate context wiring. */
// eslint-disable-next-line react-refresh/only-export-components -- useAuth + AuthProvider stay in sync
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
