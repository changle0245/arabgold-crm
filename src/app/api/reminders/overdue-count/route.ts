import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { todayLocalISO } from '@/lib/dates'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ count: 0 })

  const today = todayLocalISO()
  const { rows } = await db.query<{ c: number }>(
    `select count(*)::int as c
       from public.reminders
      where assigned_to = $1 and status = 'pending' and due_date <= $2`,
    [session.user.id, today]
  )
  return Response.json({ count: rows[0]?.c ?? 0 })
}
