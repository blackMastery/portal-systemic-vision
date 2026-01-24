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

  // If no session, handle public routes
  if (!session) {
    if (req.nextUrl.pathname.startsWith('/admin')) {
      const redirectUrl = req.nextUrl.clone()
      redirectUrl.pathname = '/login'
      redirectUrl.searchParams.set('redirectedFrom', req.nextUrl.pathname)
      return NextResponse.redirect(redirectUrl)
    }
    return res
  }

  // Get user role once and reuse it for both checks
  // This reduces database queries from 2 to 1 per request
  let userRole: string | null = null
  
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('role')
      .eq('auth_id', session.user.id)
      .single()

    if (!error && user) {
      userRole = (user as { role: string }).role
    }
  } catch (error) {
    // If we can't get user role, treat as unauthorized
    // Log error but don't expose it
    console.error('Middleware: Error fetching user role', error)
  }

  // Protect /admin routes
  if (req.nextUrl.pathname.startsWith('/admin')) {
    if (userRole !== 'admin') {
      return NextResponse.redirect(new URL('/unauthorized', req.url))
    }
  }

  // Redirect to admin if already logged in and visiting login page
  if (req.nextUrl.pathname === '/login' && userRole === 'admin') {
    return NextResponse.redirect(new URL('/admin/dashboard', req.url))
  }

  return res
}

export const config = {
  matcher: ['/admin/:path*', '/login', '/api/admin/:path*'],
}
