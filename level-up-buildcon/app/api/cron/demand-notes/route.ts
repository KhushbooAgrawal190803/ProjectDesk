import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/api/cron-auth'
import { runScheduledJobs } from '@/lib/demands/scheduler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/** Daily demand notes and their emails. Idempotent: running it twice issues and sends nothing twice. */
async function handle(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await runScheduledJobs()
    return NextResponse.json({ ok: true, today: result.today, issued: result.issued, email: result.email })
  } catch (error) {
    console.error('Scheduled cron failed')
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Scheduled check failed' }, { status: 500 })
  }
}

export const POST = handle
// Vercel Cron and most hosted schedulers call GET with the same bearer secret.
export const GET = handle
