import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireStaffPage } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { formatInr } from '@/lib/booking/money'
import { formatLetterDate } from '@/lib/documents/inr-words'
import { snapshotFromStorage } from '@/lib/documents/demand-model'
import {
  collectionStatus,
  displayStatus,
  isOverdue,
  paiseFrom,
  subtractSplit,
  todayInTimeZone,
} from '@/lib/demands/engine'
import { loadDemandRules } from '@/lib/demands/issue'
import { RecordPaymentForm } from '../record-payment-form'

const MODE_LABEL: Record<string, string> = {
  Cash: 'Cash',
  Cheque: 'Cheque',
  NEFT_RTGS: 'NEFT / RTGS',
  UPI: 'UPI',
  Other: 'Other',
}

export default async function DemandNotePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireStaffPage()
  if (!profile) redirect('/login')
  const { id } = await params
  const supabase = await createClient()
  const { data: note } = await supabase.from('demand_notes').select('*').eq('id', id).single()
  if (!note) notFound()

  const rules = await loadDemandRules(supabase)
  const today = todayInTimeZone(new Date(), rules.timezone)
  const { data: allocations } = await supabase
    .from('installment_allocations')
    .select('id, principal_amount, gst_amount, created_at, payment_receipts(payment_date, payment_mode, reference_no, remarks, source)')
    .eq('schedule_row_id', note.schedule_row_id)
    .order('created_at')

  const snapshot = snapshotFromStorage(note.snapshot as Record<string, unknown>)
  const received = (allocations || []).reduce(
    (sum, item) => ({
      principal: sum.principal + paiseFrom(item.principal_amount),
      gst: sum.gst + paiseFrom(item.gst_amount),
    }),
    { principal: 0n, gst: 0n }
  )
  const outstanding = subtractSplit(
    { principal: snapshot.installmentPaise, gst: snapshot.gstPaise },
    received
  )
  const status = collectionStatus({ due: true, demanded: true, outstanding, received })
  const overdue = isOverdue({ demanded: true, outstanding, deadline: note.payment_deadline, today })

  return (
    <DashboardLayout profile={profile}>
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-zinc-500">
              <Link href="/demand-notes">Demand notes</Link>
              {' · '}
              <Link href={`/bookings/${note.booking_id}`}>Flat {note.unit_no}</Link>
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{note.reference_number}</h1>
            <p className="mt-1 text-sm text-zinc-600">
              {note.applicant_name} · {note.trigger_label} · {displayStatus(status, overdue)}
            </p>
          </div>
          <div className="flex gap-2">
            <a className="inline-flex h-10 items-center bg-zinc-900 px-4 text-sm font-medium text-white" href={`/api/demand-notes/${note.id}/pdf`} target="_blank" rel="noreferrer">Print</a>
            <a className="inline-flex h-10 items-center border border-zinc-300 bg-white px-4 text-sm" href={`/api/demand-notes/${note.id}/pdf?download=1`}>Download</a>
          </div>
        </div>

        <p className="text-sm text-zinc-700">
          Issued {formatLetterDate(note.issue_date)}. Pay by {formatLetterDate(note.payment_deadline)}.
          Installment {formatInr(snapshot.installmentPaise)} plus GST {formatInr(snapshot.gstPaise)}.
          Still to collect {formatInr(outstanding.principal + outstanding.gst)}.
        </p>

        <iframe title="Demand note" src={`/api/demand-notes/${note.id}/pdf`} className="h-[760px] w-full border border-zinc-300 bg-white" />

        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Payments on this installment</h2>
          <div className="mt-3 space-y-2">
            {(allocations || []).length === 0 && <p className="text-sm text-zinc-500">Nothing has been recorded against this installment.</p>}
            {(allocations || []).map((item) => {
              const receipt = Array.isArray(item.payment_receipts) ? item.payment_receipts[0] : item.payment_receipts
              return (
                <p key={item.id} className="text-sm text-zinc-700">
                  {formatInr(paiseFrom(item.principal_amount))} plus GST {formatInr(paiseFrom(item.gst_amount))}
                  {receipt ? ` · ${formatLetterDate(receipt.payment_date)} · ${MODE_LABEL[receipt.payment_mode] || receipt.payment_mode || 'Mode not recorded'}` : ''}
                  {receipt?.reference_no ? ` · ${receipt.reference_no}` : ''}
                  {receipt?.remarks ? ` · ${receipt.remarks}` : ''}
                </p>
              )
            })}
          </div>
          <p className="mt-2 text-sm">
            <a className="text-zinc-700 underline" href={`/api/demand-notes/${note.id}/pdf?statement=1`} target="_blank" rel="noreferrer">Print a current balance statement</a>
          </p>
        </div>

        <div id="record-payment" className="border border-zinc-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-zinc-900">Record a payment</h2>
          <div className="mt-3">
            <RecordPaymentForm demandNoteId={note.id} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

// Document generation and the background email after a save can take longer than the default limit.
export const maxDuration = 300
