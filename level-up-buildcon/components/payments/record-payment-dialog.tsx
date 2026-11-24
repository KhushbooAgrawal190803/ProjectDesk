'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { IndianRupee } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AmountInput } from '@/components/ui/amount-input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { PaymentFormFields, paymentProblem, selectClass, type PayerOption, type PaymentFormValue } from '@/components/payments/payment-form-fields'
import { formatInr, hundredthsToString, toHundredths } from '@/lib/booking/money'
import { splitAcrossInstallments } from '@/lib/ledger/model'
import { recordBookingPayment } from '@/app/(dashboard)/bookings/[id]/payment-actions'

export interface PayableInstallment {
  id: string
  label: string
  due: boolean
  outstandingPrincipal: string
  outstandingGst: string
}

export interface ExpectedOption {
  id: string
  label: string
  remaining: string
}

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

const paise = (value: unknown) => toHundredths(value || 0) ?? 0n

export function RecordPaymentDialog({
  bookingId,
  installments,
  payers,
  expected,
  ledgerReady,
  defaultRowId,
  triggerLabel = 'Record Payment',
  triggerVariant = 'default',
}: {
  bookingId: string
  installments: PayableInstallment[]
  payers: PayerOption[]
  expected: ExpectedOption[]
  ledgerReady: boolean
  defaultRowId?: string
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline' | 'ghost'
}) {
  const router = useRouter()
  const open = installments.filter((row) => paise(row.outstandingPrincipal) > 0n || paise(row.outstandingGst) > 0n)
  const first = payers[0]
  const blank = (): PaymentFormValue => ({
    payer_kind: first?.kind || 'applicant',
    payer_coapplicant_id: first?.coapplicantId || null,
    payer_name: first?.name || '',
    amount: '',
    gst_amount: '',
    payment_mode: 'NEFT_RTGS',
    payment_mode_detail: '',
    reference_no: '',
    payment_date: today(),
    originating_bank: '',
    status: 'received',
    notes: '',
  })
  const [visible, setVisible] = useState(false)
  const [value, setValue] = useState<PaymentFormValue>(blank)
  const [expectedId, setExpectedId] = useState('')
  const [split, setSplit] = useState<Record<string, { principal: string; gst: string }>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const pending = value.status === 'pending_clearance'
  const principal = paise(value.amount)
  const gst = paise(value.gst_amount)
  const applied = useMemo(() => {
    let p = 0n
    let g = 0n
    for (const item of Object.values(split)) {
      p += paise(item.principal)
      g += paise(item.gst)
    }
    return { principal: p, gst: g }
  }, [split])
  const unapplied = { principal: principal - applied.principal, gst: gst - applied.gst }

  const fillInOrder = (amount: { principal: bigint; gst: bigint }) => {
    const startAt = defaultRowId ? Math.max(0, open.findIndex((row) => row.id === defaultRowId)) : 0
    const ordered = [...open.slice(startAt), ...open.slice(0, startAt)]
    const plan = splitAcrossInstallments(
      amount,
      ordered.map((row) => ({ id: row.id, outstandingPrincipalPaise: paise(row.outstandingPrincipal), outstandingGstPaise: paise(row.outstandingGst) }))
    )
    const next: Record<string, { principal: string; gst: string }> = {}
    for (const item of plan.allocations) {
      next[item.scheduleRowId] = { principal: hundredthsToString(item.principalPaise), gst: hundredthsToString(item.gstPaise) }
    }
    setSplit(next)
  }

  const reset = () => {
    setValue(blank())
    setExpectedId('')
    setSplit({})
    setProblem(null)
  }

  const save = async () => {
    const issue = paymentProblem(value, payers)
    if (issue) return setProblem(issue)
    if (unapplied.principal < 0n || unapplied.gst < 0n) return setProblem('The amounts applied to installments add up to more than the payment.')
    for (const row of open) {
      const item = split[row.id]
      if (!item) continue
      if (paise(item.principal) > paise(row.outstandingPrincipal)) return setProblem(`${row.label}: principal is more than the outstanding amount.`)
      if (paise(item.gst) > paise(row.outstandingGst)) return setProblem(`${row.label}: GST is more than the outstanding GST.`)
    }
    setSaving(true)
    setProblem(null)
    try {
      await recordBookingPayment({
        bookingId,
        payerKind: value.payer_kind,
        payerCoapplicantId: value.payer_coapplicant_id || null,
        payerName: value.payer_name || payers.find((option) => option.kind === value.payer_kind)?.name || null,
        principal: hundredthsToString(principal),
        gst: hundredthsToString(gst),
        paymentDate: String(value.payment_date || '').slice(0, 10),
        paymentMode: value.payment_mode || 'NEFT_RTGS',
        paymentModeDetail: value.payment_mode === 'Other' ? value.payment_mode_detail || null : null,
        reference: value.reference_no || null,
        bankName: value.originating_bank || null,
        status: pending ? 'pending_clearance' : 'cleared',
        notes: value.notes || null,
        expectedEntryId: value.payer_kind === 'bank' && expectedId ? expectedId : null,
        allocations: pending
          ? []
          : Object.entries(split).map(([scheduleRowId, item]) => ({ scheduleRowId, principal: item.principal || '0', gst: item.gst || '0' })),
      })
      toast.success(pending ? 'Payment saved as awaiting clearance' : 'Payment recorded')
      setVisible(false)
      reset()
      router.refresh()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The payment could not be saved')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={visible}
      onOpenChange={(next) => {
        setVisible(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant} className="gap-2">
          <IndianRupee className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Enter the money as it arrived. Principal and GST are kept separate. Expected bank money is not entered here until it is actually received.
          </DialogDescription>
        </DialogHeader>

        <PaymentFormFields
          value={value}
          onChange={(patch) => setValue((current) => ({ ...current, ...patch }))}
          payers={payers}
          statuses={['received', 'pending_clearance']}
          ledgerReady={ledgerReady}
        />

        {value.payer_kind === 'bank' && expected.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="expected-link">Expected bank contribution this payment fulfils</Label>
            <select id="expected-link" className={selectClass} value={expectedId} onChange={(event) => setExpectedId(event.target.value)}>
              <option value="">None</option>
              {expected.map((item) => (
                <option key={item.id} value={item.id}>{item.label} · {formatInr(item.remaining)} still expected</option>
              ))}
            </select>
            <p className="text-xs text-zinc-500">Linking reduces the expected amount by what arrived, so the bank money is not counted twice.</p>
          </div>
        )}

        {!pending && (
          <div className="space-y-3 rounded-lg border border-zinc-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-zinc-900">Apply to installments</p>
                <p className="text-xs text-zinc-500">Split one payment across several installments, or leave part of it unapplied.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => fillInOrder({ principal, gst })} disabled={principal <= 0n && gst <= 0n}>
                Apply in order
              </Button>
            </div>
            {open.length === 0 ? (
              <p className="text-sm text-zinc-500">Every installment is fully paid.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="py-1 pr-2 font-medium">Installment</th>
                      <th className="py-1 pr-2 text-right font-medium">Outstanding</th>
                      <th className="py-1 pr-2 font-medium">Principal</th>
                      <th className="py-1 font-medium">GST</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {open.map((row) => (
                      <tr key={row.id}>
                        <td className="py-2 pr-2">
                          {row.label}
                          {row.due && <span className="ml-2 text-xs text-amber-700">Due</span>}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">
                          {formatInr(row.outstandingPrincipal)}
                          <div className="text-xs text-zinc-500">+ GST {formatInr(row.outstandingGst)}</div>
                        </td>
                        <td className="py-2 pr-2">
                          <AmountInput
                            aria-label={`Principal for ${row.label}`}
                            className="h-9"
                            value={split[row.id]?.principal ?? ''}
                            onValueChange={(principal) => setSplit((current) => ({ ...current, [row.id]: { principal, gst: current[row.id]?.gst ?? '' } }))}
                          />
                        </td>
                        <td className="py-2">
                          <AmountInput
                            aria-label={`GST for ${row.label}`}
                            className="h-9"
                            value={split[row.id]?.gst ?? ''}
                            onValueChange={(gst) => setSplit((current) => ({ ...current, [row.id]: { gst, principal: current[row.id]?.principal ?? '' } }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className={`text-sm ${unapplied.principal < 0n || unapplied.gst < 0n ? 'text-red-600' : 'text-zinc-600'}`}>
              Applied {formatInr(applied.principal)} + GST {formatInr(applied.gst)}.
              {unapplied.principal > 0n || unapplied.gst > 0n
                ? ` ${formatInr(unapplied.principal > 0n ? unapplied.principal : 0n)} + GST ${formatInr(unapplied.gst > 0n ? unapplied.gst : 0n)} stays as unapplied credit.`
                : ''}
            </p>
          </div>
        )}
        {pending && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This cheque is recorded but not counted as received. When it clears, mark it Cleared in Financials and it is applied to installments in order.
          </p>
        )}

        {problem && <p className="text-sm text-red-600">{problem}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setVisible(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save payment'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
