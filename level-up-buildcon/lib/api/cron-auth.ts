import { timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

/** Vercel Cron and other schedulers send "Authorization: Bearer <CRON_SECRET>". */
export function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(request.headers.get('authorization') || '')
  return expected.length === given.length && timingSafeEqual(expected, given)
}
