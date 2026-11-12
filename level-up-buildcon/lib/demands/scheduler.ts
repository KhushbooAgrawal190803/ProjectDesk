import { createServiceClient } from '@/lib/supabase/server'
import { todayInTimeZone } from '@/lib/demands/engine'
import { loadDemandRules, reconcileActiveBookings } from '@/lib/demands/issue'

/** Catch up every active booking. Missed dates stay due until a run succeeds. */
export async function runDueDateDemands(now = new Date()) {
  const supabase = await createServiceClient()
  const rules = await loadDemandRules(supabase)
  const today = todayInTimeZone(now, rules.timezone)
  const issued = await reconcileActiveBookings(supabase, today)
  return { today, issued }
}

/** Demand notes first, then the emails for anything newly due, then pending deliveries and retries. */
export async function runScheduledJobs(now = new Date()) {
  const demands = await runDueDateDemands(now)
  let email: { created: number; processed: number } | { error: string } = { created: 0, processed: 0 }
  try {
    const { runEmailSchedule } = await import('@/lib/email/service')
    email = await runEmailSchedule()
  } catch (error) {
    email = { error: error instanceof Error ? error.message : 'Email schedule failed' }
  }
  return { ...demands, email }
}

/** While this server process runs, every five minutes. A deployed cron calls /api/cron/demand-notes instead. */
export function startDemandScheduler() {
  const state = globalThis as { __lubcDemandScheduler?: boolean; __lubcSchedulerBusy?: boolean }
  if (state.__lubcDemandScheduler) return
  state.__lubcDemandScheduler = true
  const run = () => {
    if (state.__lubcSchedulerBusy) return
    state.__lubcSchedulerBusy = true
    runScheduledJobs()
      .catch((error) => {
        console.error('Scheduled check failed:', error instanceof Error ? error.message : error)
      })
      .finally(() => {
        state.__lubcSchedulerBusy = false
      })
  }
  setTimeout(run, 20_000)
  setInterval(run, 5 * 60 * 1000)
}
