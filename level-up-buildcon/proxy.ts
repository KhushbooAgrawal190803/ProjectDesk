import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Derive the Supabase project ref from the URL to find the auth cookie
  // Cookie name pattern: sb-<project-ref>-auth-token
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || ''
  const hasSession =
    !!request.cookies.get(`sb-${projectRef}-auth-token`) ||
    !!request.cookies.get(`sb-${projectRef}-auth-token.0`) ||
    !!request.cookies.get('sb-access-token')

  const protectedPaths = ['/dashboard', '/bookings', '/admin', '/new-booking', '/accounts', '/lookup']
  const isProtected = protectedPaths.some(p => pathname.startsWith(p))

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  if (hasSession && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
