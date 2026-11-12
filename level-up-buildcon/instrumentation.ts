export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  // On Vercel, functions stop between requests; Vercel Cron calls /api/cron/* instead.
  if (process.env.VERCEL) return
  const { startDemandScheduler } = await import('@/lib/demands/scheduler')
  startDemandScheduler()
}
