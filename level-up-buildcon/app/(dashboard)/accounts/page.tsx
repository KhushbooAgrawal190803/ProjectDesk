import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireStaffPage } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { InstallmentStatusBadge, PaymentStandingBadge, paymentStanding } from '@/components/booking/status-badge'
import { RecordPaymentDialog } from '@/components/payments/record-payment-dialog'
import { formatInr } from '@/lib/booking/money'
import { formatPersonName } from '@/lib/booking/person'
import { formatLetterDate } from '@/lib/documents/inr-words'
import { CONSTRUCTION_MILESTONES } from '@/lib/demands/milestones'
import { loadPortfolio } from '@/lib/ledger/portfolio'
import { expectedFor, payableFor, payersFor } from '@/lib/ledger/payers'

export const dynamic = 'force-dynamic'

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardContent className="px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ view?: string; stage?: string }> }) {
  const profile = await requireStaffPage()
  if (!profile) redirect('/login')
  const params = await searchParams
  const view = params.view === 'installments' ? 'installments' : 'bookings'
  const supabase = await createClient()
  const { entries, totals, milestones } = await loadPortfolio(supabase)
  const ledgerReady = entries.some((entry) => entry.ledger?.migrationApplied)

  const dates = [...new Set(entries.flatMap((entry) => [...entry.rowTrigger.values()].map((item) => item.date).filter(Boolean) as string[]))].sort()
  const stage = params.stage || CONSTRUCTION_MILESTONES[0].code
  const stageLabel = stage.startsWith('date:')
    ? `Scheduled ${formatLetterDate(stage.slice(5))}`
    : CONSTRUCTION_MILESTONES.find((item) => item.code === stage)?.label || stage
  const completed = new Map(milestones.map((item) => [String(item.code), item.completed_at as string | null]))

  const stageRows = entries.flatMap((entry) => {
    if (!entry.ledger) return []
    return entry.ledger.state.installments
      .filter((row) => {
        const trigger = entry.rowTrigger.get(row.id)
        return stage.startsWith('date:') ? trigger?.date === stage.slice(5) : trigger?.code === stage
      })
      .map((row) => ({ entry, row }))
  })
  const stageTotals = stageRows.reduce(
    (sum, { row }) => ({
      due: sum.due + row.principalPaise + row.gstPaise,
      collected: sum.collected + row.receivedPaise + row.gstReceivedPaise,
      outstanding: sum.outstanding + row.outstandingPrincipalPaise + row.outstandingGstPaise,
    }),
    { due: 0n, collected: 0n, outstanding: 0n }
  )
  const collectionPercent = stageTotals.due > 0n ? Number((stageTotals.collected * 1000n) / stageTotals.due) / 10 : 0
  const unapplied = entries.filter((entry) => entry.ledger && entry.ledger.summary.unallocatedPrincipalPaise + entry.ledger.summary.unallocatedGstPaise > 0n)

  const tabClass = (active: boolean) =>
    `inline-flex h-9 items-center border-b-2 px-3 text-sm font-medium ${active ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-900'}`

  return (
    <DashboardLayout profile={profile}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-zinc-900">Payments</h1>
            <p className="mt-1 text-zinc-600">Money received and still due across all active bookings. Every figure comes from the same receipts the booking pages use.</p>
          </div>
          <Link
            href="/accounts/statement"
            className="inline-flex shrink-0 items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Cash Statement
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total Consideration" value={formatInr(totals.considerationPaise)} hint={`+ GST ${formatInr(totals.gstPayablePaise)} · ${entries.length} bookings`} />
          <Stat
            label="Total Received"
            value={formatInr(totals.receivedPrincipalPaise + totals.receivedGstPaise)}
            hint={`Cleared money only${totals.pendingClearancePaise > 0n ? ` · ${formatInr(totals.pendingClearancePaise)} awaiting clearance` : ''}`}
          />
          <Stat
            label="Total Outstanding"
            value={formatInr(totals.outstandingPaise)}
            hint={`incl. GST${totals.expectedBankPaise > 0n ? ` · ${formatInr(totals.expectedBankPaise)} expected from banks` : ''}${totals.overduePaise > 0n ? ` · ${formatInr(totals.overduePaise)} overdue` : ''}`}
          />
          <Stat label="GST Collected" value={formatInr(totals.receivedGstPaise)} hint={`of ${formatInr(totals.gstPayablePaise)} GST payable`} />
        </div>

        {unapplied.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">Received money not yet applied to installments</p>
            <p className="mt-0.5 text-amber-800">Open each booking and choose Review and apply. You see exactly where the money goes before anything changes.</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {unapplied.map((entry) => (
                <li key={String(entry.booking.id)}>
                  <Link href={`/bookings/${entry.booking.id}`} className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100">
                    {String(entry.booking.serial_display || '—')} · Flat {String(entry.booking.unit_no)} · {formatInr(entry.ledger!.summary.unallocatedPrincipalPaise + entry.ledger!.summary.unallocatedGstPaise)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-1 border-b border-zinc-200">
          <Link href="/accounts" className={tabClass(view === 'bookings')}>Booking Financials</Link>
          <Link href="/accounts?view=installments" className={tabClass(view === 'installments')}>Installment Collections</Link>
        </div>

        {view === 'bookings' ? (
          <Card className="border-zinc-200 shadow-sm">
            <CardContent className="p-0">
              {entries.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-zinc-500">No active bookings yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Serial</th>
                        <th className="px-4 py-3 font-medium">Purchaser</th>
                        <th className="px-4 py-3 font-medium">Flat</th>
                        <th className="px-4 py-3 text-right font-medium">Consideration</th>
                        <th className="px-4 py-3 text-right font-medium">Received</th>
                        <th className="px-4 py-3 text-right font-medium">Awaiting / expected</th>
                        <th className="px-4 py-3 text-right font-medium">Outstanding</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {entries.map(({ booking, ledger, error }) => {
                        const summary = ledger?.summary
                        return (
                          <tr key={String(booking.id)} className="hover:bg-zinc-50">
                            <td className="px-4 py-3">
                              <Link href={`/bookings/${booking.id}`}>
                                <Badge variant="outline" className="font-mono">{String(booking.serial_display || '—')}</Badge>
                              </Link>
                            </td>
                            <td className="px-4 py-3 font-medium">
                              <Link href={`/bookings/${booking.id}`} className="hover:underline">
                                {formatPersonName(booking.applicant_salutation as string, booking.applicant_name as string) || '—'}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-zinc-600">{String(booking.unit_no || '—')}</td>
                            {summary ? (
                              <>
                                <td className="px-4 py-3 text-right tabular-nums">{formatInr(summary.considerationPaise)}</td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                  {formatInr(summary.receivedTotalPaise)}
                                  <div className="text-xs text-zinc-500">incl. GST {formatInr(summary.receivedGstPaise)}</div>
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
                                  {summary.pendingClearancePaise > 0n && <div>{formatInr(summary.pendingClearancePaise)} clearing</div>}
                                  {summary.expectedBankPaise > 0n && <div>{formatInr(summary.expectedBankPaise)} bank</div>}
                                  {summary.pendingClearancePaise === 0n && summary.expectedBankPaise === 0n && '—'}
                                </td>
                                <td className="px-4 py-3 text-right font-medium tabular-nums">{formatInr(summary.outstandingPaise)}</td>
                                <td className="px-4 py-3"><PaymentStandingBadge standing={paymentStanding(summary)} /></td>
                              </>
                            ) : (
                              <td colSpan={5} className="px-4 py-3 text-amber-700">{error}</td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-zinc-200 shadow-sm">
            <CardHeader className="space-y-3">
              <CardTitle className="text-base">Installment Collections</CardTitle>
              <form method="get" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="view" value="installments" />
                <label className="text-sm text-zinc-600">
                  Installment
                  <select name="stage" defaultValue={stage} className="mt-1 block h-10 min-w-80 rounded-lg border border-zinc-200 bg-white px-3 text-sm">
                    <optgroup label="Construction milestones">
                      {CONSTRUCTION_MILESTONES.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.sort}. {item.label}{completed.get(item.code) ? ' · completed' : ''}
                        </option>
                      ))}
                    </optgroup>
                    {dates.length > 0 && (
                      <optgroup label="Scheduled dates">
                        {dates.map((date) => <option key={date} value={`date:${date}`}>{formatLetterDate(date)}</option>)}
                      </optgroup>
                    )}
                  </select>
                </label>
                <button type="submit" className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium hover:bg-zinc-50">Show</button>
              </form>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-zinc-200 px-4 py-3"><p className="text-xs text-zinc-500">Due</p><p className="font-semibold tabular-nums">{formatInr(stageTotals.due)}</p></div>
                <div className="rounded-lg border border-zinc-200 px-4 py-3"><p className="text-xs text-zinc-500">Collected</p><p className="font-semibold tabular-nums">{formatInr(stageTotals.collected)}</p></div>
                <div className="rounded-lg border border-zinc-200 px-4 py-3"><p className="text-xs text-zinc-500">Outstanding</p><p className="font-semibold tabular-nums">{formatInr(stageTotals.outstanding)}</p></div>
                <div className="rounded-lg border border-zinc-200 px-4 py-3"><p className="text-xs text-zinc-500">Collected</p><p className="font-semibold tabular-nums">{collectionPercent.toFixed(1)}%</p></div>
              </div>
              <p className="text-sm text-zinc-500">{stageLabel} · {stageRows.length} booking{stageRows.length === 1 ? '' : 's'}. Amounts include GST; the principal and GST split is under each amount.</p>
              {stageRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">No booking has an installment on this stage.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Booking</th>
                        <th className="py-2 pr-3 text-right font-medium">Due</th>
                        <th className="py-2 pr-3 text-right font-medium">Collected</th>
                        <th className="py-2 pr-3 text-right font-medium">Outstanding</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {stageRows.map(({ entry, row }) => (
                        <tr key={row.id}>
                          <td className="py-2 pr-3">
                            <Link href={`/bookings/${entry.booking.id}`} className="font-medium hover:underline">
                              {String(entry.booking.serial_display || '—')} · Flat {String(entry.booking.unit_no)}
                            </Link>
                            <div className="text-xs text-zinc-500">{formatPersonName(entry.booking.applicant_salutation as string, entry.booking.applicant_name as string)}</div>
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatInr(row.principalPaise + row.gstPaise)}
                            <div className="text-xs text-zinc-500">{formatInr(row.principalPaise)} + GST {formatInr(row.gstPaise)}</div>
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatInr(row.receivedPaise + row.gstReceivedPaise)}</td>
                          <td className="py-2 pr-3 text-right font-medium tabular-nums">{formatInr(row.outstandingPrincipalPaise + row.outstandingGstPaise)}</td>
                          <td className="py-2 pr-3"><InstallmentStatusBadge status={row.status} /></td>
                          <td className="py-2 text-right">
                            {row.outstandingPrincipalPaise + row.outstandingGstPaise > 0n && entry.ledger && (
                              <RecordPaymentDialog
                                bookingId={String(entry.booking.id)}
                                installments={payableFor(entry.ledger)}
                                payers={payersFor(entry.booking, (entry.booking.coapplicants as Record<string, unknown>[]) || [])}
                                expected={expectedFor(entry.ledger)}
                                ledgerReady={ledgerReady}
                                defaultRowId={row.id}
                                triggerLabel="Record"
                                triggerVariant="outline"
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}

// Document generation and the background email after a save can take longer than the default limit.
export const maxDuration = 300
