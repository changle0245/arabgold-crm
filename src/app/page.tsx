import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', session.user.id)
    .single()

  if (!profile || profile.is_active === false) {
    await supabase.auth.signOut()
    redirect('/login?reason=inactive')
  }

  if (profile.role === 'admin') {
    redirect('/dashboard/boss')
  } else {
    redirect('/dashboard/personal')
  }
}
