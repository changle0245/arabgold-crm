import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from './db'

type ProfileRow = {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'member'
  password_hash: string | null
  is_active: boolean
  must_change_password: boolean
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(creds) {
        const email = String(creds?.email ?? '').trim().toLowerCase()
        const password = String(creds?.password ?? '')
        if (!email || !password) return null

        const { rows } = await db.query<ProfileRow>(
          `select id, email, full_name, role, password_hash, is_active, must_change_password
             from public.profiles
            where lower(email) = $1
            limit 1`,
          [email]
        )
        const user = rows[0]
        if (!user || !user.is_active || !user.password_hash) return null

        const ok = await bcrypt.compare(password, user.password_hash)
        if (!ok) return null

        return {
          id: user.id,
          email: user.email,
          name: user.full_name,
          role: user.role,
          mustChangePassword: user.must_change_password,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = (user as { id: string }).id
        token.role = (user as { role: 'admin' | 'member' }).role
        token.mustChangePassword = (user as { mustChangePassword: boolean }).mustChangePassword
      }
      if (trigger === 'update' && session?.mustChangePassword === false) {
        token.mustChangePassword = false
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as 'admin' | 'member'
        session.user.mustChangePassword = token.mustChangePassword as boolean
      }
      return session
    },
  },
})
