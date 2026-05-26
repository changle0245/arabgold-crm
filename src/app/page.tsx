import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  // H6: getUser() 向 Auth 服务器复验 JWT;getSession() 只解 cookie 不复验。
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
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
