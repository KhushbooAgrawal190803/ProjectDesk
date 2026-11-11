import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { formatInr } from '@/lib/booking/money'
import { formatLetterDate } from '@/lib/documents/inr-words'
import { getBookingDemandState } from '@/lib/demands/issue'
import { AllocateAdvanceForm } from './allocate-advance-form'

export async function InstallmentPanel({ bookingId }: { bookingId: string }) {
  const supabase = await createClient()
  let state: Awaited<ReturnType<typeof getBookingDemandState>> | null = null
  let loadError: string | null = null
  try {
    state = await getBookingDemandState(supabase, bookingId)
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Installments are not available yet.'
  }

  return (
    <Card className="border-zinc-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Installments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError && (
          <p className="text-sm text-amber-800">
            Demand notes are not available until <span className="font-mono">supabase/migrations/006_demand_notes.sql</span> has been run.
          </p>
        )}
        {state && (
          <>
            {state.blockers.length > 0 && state.finalized && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Demand notes are waiting: {state.blockers.join(' ')}
              </div>
            )}
            {!state.finalized && <p className="text-sm text-zinc-500">Installments become due after this booking is finalized.</p>}
            <p className="text-sm text-zinc-700">
              Booking receipt {formatInr(state.advancePrincipalPaise)} plus GST {formatInr(state.advanceGstPaise)}.
              {state.unallocatedPrincipalPaise > 0n || state.unallocatedGstPaise > 0n
                ? ` ${formatInr(state.unallocatedPrincipalPaise)} plus GST ${formatInr(state.unallocatedGstPaise)} is not applied to an installment yet.`
                : ''}
            </p>
            {(state.unallocatedPrincipalPaise > 0n || state.unallocatedGstPaise > 0n) && state.installments.length > 0 && (
              <AllocateAdvanceForm
                bookingId={bookingId}
                installments={state.installments.map((item) => ({ id: item.id, label: item.label }))}
              />
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="py-2 pr-3">Installment</th>
                    <th className="py-2 pr-3">Trigger</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                    <th className="py-2 pr-3 text-right">GST</th>
                    <th className="py-2 pr-3 text-right">Outstanding</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">Demand note</th>
                  </tr>
                </thead>
                <tbody>
                  {state.installments.map((item, index) => (
                    <tr key={item.id} className="border-b border-zinc-100">
                      <td className="py-2 pr-3">{index + 1}</td>
                      <td className="py-2 pr-3">{item.label}</td>
                      <td className="py-2 pr-3 text-right">{formatInr(item.principalPaise)}</td>
                      <td className="py-2 pr-3 text-right">{formatInr(item.gstPaise)}</td>
                      <td className="py-2 pr-3 text-right">{formatInr(item.outstandingPrincipalPaise + item.outstandingGstPaise)}</td>
                      <td className="py-2 pr-3">{item.status}</td>
                      <td className="py-2">
                        {item.demandId ? (
                          <span className="whitespace-nowrap">
                            <a className="font-medium text-zinc-900" href={`/api/demand-notes/${item.demandId}/pdf`} target="_blank" rel="noreferrer">Print</a>
                            {' · '}
                            <Link href={`/demand-notes/${item.demandId}#record-payment`}>Record payment</Link>
                          </span>
                        ) : item.due ? 'Due, not issued' : '—'}
                        {item.deadline && <div className="text-xs text-zinc-500">Pay by {formatLetterDate(item.deadline)}</div>}
                      </td>
                    </tr>
                  ))}
                  {state.installments.length === 0 && (
                    <tr><td colSpan={7} className="py-3 text-zinc-500">No payment schedule is saved on this booking.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
