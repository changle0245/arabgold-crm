import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export default async function Home() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { rows } = await db.query<{ role: 'admin' | 'member'; is_active: boolean }>(
    'select role, is_active from public.profiles where id = $1 limit 1',
    [session.user.id]
  )
  const profile = rows[0]

  if (!profile || profile.is_active === false) {
    redirect('/login?reason=inactive')
  }

  if (session.user.mustChangePassword) {
    redirect('/account/change-password')
  }

  if (profile.role === 'admin') redirect('/dashboard/boss')
  redirect('/dashboard/personal')
}
