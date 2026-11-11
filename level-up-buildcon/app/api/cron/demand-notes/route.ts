import { NextRequest, NextResponse } from 'next/server'
import { runDueDateDemands } from '@/lib/demands/scheduler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runDueDateDemands()
    return NextResponse.json({ ok: true, today: result.today, issued: result.issued })
  } catch (error) {
    console.error('Demand note cron failed')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Demand note check failed' },
      { status: 500 }
    )
  }
}
