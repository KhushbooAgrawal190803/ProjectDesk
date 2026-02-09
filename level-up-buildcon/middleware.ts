import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Simple middleware that just forwards cookies (no external libs)
  // Auth protection is handled in server components/layouts
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

