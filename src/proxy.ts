import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

export async function proxy(request: NextRequest) {
  const session = await auth()
  const user = session?.user ?? null

  const pathname = request.nextUrl.pathname
  const isLoginPage = pathname === '/login'
  const isChangePassPage = pathname.startsWith('/account/change-password')

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    if (user.mustChangePassword) {
      url.pathname = '/account/change-password'
    } else {
      url.pathname = user.role === 'admin' ? '/dashboard/boss' : '/dashboard/personal'
    }
    return NextResponse.redirect(url)
  }

  if (user && user.mustChangePassword && !isChangePassPage && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/account/change-password'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
