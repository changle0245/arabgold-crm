'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

interface AuthContextType {
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType>({ profile: null, loading: true, isAdmin: false })

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    // Returns true if the user was forced out (caller should NOT setProfile).
    async function enforceActiveOrSignOut(p: Profile | null): Promise<boolean> {
      if (p && p.is_active === false) {
        await supabase.auth.signOut()
        setProfile(null)
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.replace('/login?reason=inactive')
        }
        return true
      }
      return false
    }

    // Forces redirect to change-password page when the member's password hasn't been changed yet.
    // Does NOT sign out — the user stays authenticated, only routes outside /account/change-password are blocked.
    function enforcePasswordChange(p: Profile | null) {
      if (!p?.must_change_password) return
      if (typeof window === 'undefined') return
      const pathname = window.location.pathname
      if (pathname.startsWith('/account/change-password') || pathname.startsWith('/login')) return
      window.location.replace('/account/change-password')
    }

    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        const stopped = await enforceActiveOrSignOut(data)
        if (!stopped) {
          setProfile(data)
          enforcePasswordChange(data)
        }
      }
      setLoading(false)
    }

    loadProfile()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null)
      } else if (session?.user) {
        const userId = session.user.id
        setTimeout(async () => {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()
          const stopped = await enforceActiveOrSignOut(data)
          if (!stopped) {
            setProfile(data)
            enforcePasswordChange(data)
          }
        }, 0)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ profile, loading, isAdmin: profile?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}
