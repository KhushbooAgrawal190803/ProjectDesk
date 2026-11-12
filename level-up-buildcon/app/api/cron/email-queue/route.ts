import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/api/cron-auth'
import { runEmailSchedule } from '@/lib/email/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Sends anything queued or due for retry, and any scheduled-date email not yet created.
 * Safe to call as often as every few minutes; it never sends a delivery twice.
 */
async function handle(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await runEmailSchedule()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('Email queue cron failed')
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Email queue failed' }, { status: 500 })
  }
}

export const POST = handle
export const GET = handle
