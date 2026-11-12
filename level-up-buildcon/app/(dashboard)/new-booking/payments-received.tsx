'use client'

import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PaymentFormFields, paymentProblem, payerLabel, type PayerOption, type PaymentFormValue } from '@/components/payments/payment-form-fields'
import type { PaymentEntryInput } from '@/lib/booking/persist-details'
import { formatInr, toHundredths } from '@/lib/booking/money'
import { ENTRY_STATUS_LABELS, PAYMENT_MODE_LABELS, normalizeEntryStatus } from '@/lib/ledger/model'

export function blankPayment(payers: PayerOption[]): PaymentFormValue {
  const first = payers[0]
  return {
    payer_kind: first?.kind || 'applicant',
    payer_coapplicant_id: first?.coapplicantId || null,
    payer_name: first?.name || '',
    amount: '',
    gst_amount: '',
    payment_mode: 'NEFT_RTGS',
    payment_mode_detail: '',
    reference_no: '',
    payment_date: '',
    originating_bank: '',
    status: 'received',
    notes: '',
  }
}

export function statusTone(status: string | null | undefined): string {
  switch (normalizeEntryStatus(status)) {
    case 'pending_clearance':
      return 'border-amber-200 bg-amber-50 text-amber-800'
    case 'returned':
      return 'border-red-200 bg-red-50 text-red-700'
    case 'expected':
      return 'border-zinc-200 bg-zinc-50 text-zinc-600'
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }
}

export function PaymentsReceived({
  entries,
  onChange,
  payers,
  ledgerReady,
}: {
  /** Money paid. Expected bank money is kept in the financing section, not here. */
  entries: PaymentEntryInput[]
  onChange: (entries: PaymentEntryInput[]) => void
  payers: PayerOption[]
  ledgerReady: boolean
}) {
  const [editing, setEditing] = useState<PaymentFormValue | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const open = (value: PaymentFormValue) => {
    setProblem(null)
    setEditing(value)
  }
  const save = () => {
    if (!editing) return
    const issue = paymentProblem(editing, payers)
    if (issue) {
      setProblem(issue)
      return
    }
    const entry: PaymentEntryInput = {
      ...editing,
      id: editing.id || crypto.randomUUID(),
      payer_name: editing.payer_name || payers.find((option) => option.kind === editing.payer_kind && (option.coapplicantId || null) === (editing.payer_coapplicant_id || null))?.name || '',
    }
    const exists = entries.some((item) => item.id === entry.id)
    onChange(exists ? entries.map((item) => (item.id === entry.id ? entry : item)) : [...entries, entry])
    setEditing(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold text-zinc-900">Payments received</h4>
          <p className="text-xs text-zinc-500">Each cheque, transfer or cash payment is one row. Expected bank money is not entered here.</p>
        </div>
        <Button type="button" variant="outline" className="gap-2" onClick={() => open(blankPayment(payers))}>
          <Plus className="h-4 w-4" />
          Add Payment
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
          No payments added yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Payer</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Mode</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {entries.map((entry) => {
                const gst = toHundredths(entry.gst_amount) ?? 0n
                return (
                  <tr key={entry.id}>
                    <td className="px-3 py-2 text-zinc-900">{payerLabel(entry, payers)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatInr(entry.amount)}
                      {gst > 0n && <div className="text-xs text-zinc-500">+ GST {formatInr(gst)}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {PAYMENT_MODE_LABELS[entry.payment_mode || ''] || entry.payment_mode || '—'}
                      {entry.reference_no && <div className="text-xs text-zinc-500">{entry.reference_no}</div>}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{entry.payment_date ? formatDate(entry.payment_date) : '—'}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={statusTone(entry.status)}>
                        {ENTRY_STATUS_LABELS[normalizeEntryStatus(entry.status)]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => open({ ...entry })}>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-red-600 hover:text-red-700"
                          onClick={() => onChange(entries.filter((item) => item.id !== entry.id))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editing != null} onOpenChange={(next) => !next && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id && entries.some((item) => item.id === editing.id) ? 'Edit payment' : 'Add payment'}</DialogTitle>
            <DialogDescription>Enter the payment as it was received. GST is kept separate from the amount.</DialogDescription>
          </DialogHeader>
          {editing && (
            <PaymentFormFields
              value={editing}
              onChange={(patch) => setEditing((current) => (current ? { ...current, ...patch } : current))}
              payers={payers}
              statuses={['received', 'cleared', 'pending_clearance', 'returned']}
              ledgerReady={ledgerReady}
            />
          )}
          {problem && <p className="text-sm text-red-600">{problem}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="button" onClick={save}>Save payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return value
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
