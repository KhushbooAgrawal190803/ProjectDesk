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

export function startDemandScheduler() {
  const state = globalThis as { __lubcDemandScheduler?: boolean }
  if (state.__lubcDemandScheduler) return
  state.__lubcDemandScheduler = true
  const run = () => {
    runDueDateDemands().catch((error) => {
      console.error('Demand note check failed:', error instanceof Error ? error.message : error)
    })
  }
  setTimeout(run, 20_000)
  setInterval(run, 5 * 60 * 1000)
}
