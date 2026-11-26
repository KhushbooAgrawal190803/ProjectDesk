import { requireStaffPage } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { OWNER_NAMES, type OwnerType } from '@/lib/data/flat-ownership'
import { hundredthsToString } from '@/lib/booking/money'
import { todayInTimeZone } from '@/lib/demands/engine'
import { loadBookingLedgers } from '@/lib/ledger/load'
import { buildStatements } from '@/lib/ledger/statement'
import { StatementView, type StatementViewData } from './statement-view'

export const dynamic = 'force-dynamic'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** 1 April of the current Indian financial year. */
function financialYearStart(today: string): string {
  const [year, month] = today.split('-').map(Number)
  return `${month >= 4 ? year : year - 1}-04-01`
}

export default async function CashStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; owner?: string }>
}) {
  const profile = await requireStaffPage()
  const params = await searchParams
  const today = todayInTimeZone(new Date())
  const from = ISO_DATE.test(params.from || '') ? params.from! : financialYearStart(today)
  const to = ISO_DATE.test(params.to || '') ? params.to! : today
  const owner: OwnerType = params.owner === 'balaji' ? 'LANDOWNER' : 'DEVELOPER'

  const supabase = await createClient()
  let error: string | null = null
  let data: Record<OwnerType, StatementViewData> | null = null
  try {
    // Only bookings with money received in the period are loaded.
    const { data: received, error: receiptError } = await supabase
      .from('payment_receipts')
      .select('booking_id')
      .eq('clearance_status', 'cleared')
      .gte('payment_date', from)
      .lte('payment_date', to)
    if (receiptError) throw new Error(receiptError.message)
    const ids = [...new Set((received || []).map((row) => String(row.booking_id)))]
    const ledgers = await loadBookingLedgers(supabase, ids)
    const statements = buildStatements(ledgers.values(), { from, to })
    data = Object.fromEntries(
      Object.entries(statements).map(([key, statement]) => [
        key,
        {
          title: OWNER_NAMES[key as OwnerType],
          rows: statement.rows.map(({ amountPaise, ...row }) => ({ ...row, amount: hundredthsToString(amountPaise) })),
          principal: hundredthsToString(statement.principalPaise),
          gst: hundredthsToString(statement.gstPaise),
          total: hundredthsToString(statement.totalPaise),
          payments: statement.payments,
        },
      ])
    ) as Record<OwnerType, StatementViewData>
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : 'The statement could not be prepared.'
  }

  return (
    <DashboardLayout profile={profile}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">Cash Statement</h1>
          <p className="mt-1 text-zinc-600">
            Money actually received, in date order. Cheques awaiting clearance, returned payments and money still expected from banks are not included.
          </p>
        </div>
        {error || !data ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</p>
        ) : (
          <StatementView from={from} to={to} owner={owner === 'LANDOWNER' ? 'balaji' : 'levelup'} statements={{ levelup: data.DEVELOPER, balaji: data.LANDOWNER }} />
        )}
      </div>
    </DashboardLayout>
  )
}
