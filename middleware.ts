import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Database } from '@/types/database'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient<Database>({ req, res })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Protect /admin routes
  if (req.nextUrl.pathname.startsWith('/admin')) {
    if (!session) {
      const redirectUrl = req.nextUrl.clone()
      redirectUrl.pathname = '/login'
      redirectUrl.searchParams.set('redirectedFrom', req.nextUrl.pathname)
      return NextResponse.redirect(redirectUrl)
    }

    // Verify admin role
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('auth_id', session.user.id)
      .single()

    if (!user || (user as { role: string }).role !== 'admin') {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }
  }

  // Redirect to admin if already logged in and visiting login page
  if (req.nextUrl.pathname === '/login' && session) {
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('auth_id', session.user.id)
      .single()

    if (user && (user as { role: string }).role === 'admin') {
      return NextResponse.redirect(new URL('/admin/dashboard', req.url))
    }
  }

  return res
}

export const config = {
  matcher: ['/admin/:path*', '/login', '/api/admin/:path*'],
}
