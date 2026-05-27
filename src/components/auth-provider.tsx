'use client'

import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { SessionProvider, useSession } from 'next-auth/react'

type AuthProfile = {
  id: string
  full_name: string
  role: 'admin' | 'member'
  is_active: true
  must_change_password: boolean
} | null

interface AuthContextType {
  profile: AuthProfile
  loading: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType>({ profile: null, loading: true, isAdmin: false })

export function useAuth() {
  return useContext(AuthContext)
}

function ProfileSync({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const loading = status === 'loading'

  const profile: AuthProfile = session?.user
    ? {
        id: session.user.id,
        full_name: session.user.name ?? '',
        role: session.user.role,
        is_active: true,
        must_change_password: session.user.mustChangePassword,
      }
    : null

  useEffect(() => {
    if (loading || !profile) return
    if (typeof window === 'undefined') return
    if (!profile.must_change_password) return
    const pathname = window.location.pathname
    if (pathname.startsWith('/account/change-password') || pathname.startsWith('/login')) return
    window.location.replace('/account/change-password')
  }, [loading, profile])

  return (
    <AuthContext.Provider value={{ profile, loading, isAdmin: profile?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ProfileSync>{children}</ProfileSync>
    </SessionProvider>
  )
}
