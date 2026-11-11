'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { PaymentEntryInput } from '@/lib/booking/persist-details'

const MODES = [
  ['Cash', 'Cash'],
  ['Cheque', 'Cheque'],
  ['NEFT_RTGS', 'NEFT / RTGS'],
  ['Other', 'Others'],
] as const

export function emptyPaymentEntry(): PaymentEntryInput {
  return {
    id: crypto.randomUUID(),
    payer_kind: 'applicant',
    payer_name: '',
    amount: '',
    payment_mode: 'Cash',
    reference_no: '',
    payment_date: '',
    originating_bank: '',
    status: 'received',
  }
}

export function PaymentEntriesFields({
  entries,
  onChange,
}: {
  entries: PaymentEntryInput[]
  onChange: (entries: PaymentEntryInput[]) => void
}) {
  const update = (id: string, patch: Partial<PaymentEntryInput>) => {
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Booking payments</h3>
          <p className="text-xs text-zinc-500 mt-1">
            Add each amount that has actually been received. A bank contribution marked Expected stays outstanding and is not treated as received.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => onChange([...entries, emptyPaymentEntry()])}>
          Add payment
        </Button>
      </div>
      {entries.map((entry, index) => (
        <div key={entry.id} className="grid grid-cols-1 gap-3 rounded-lg border border-zinc-200 p-4 md:grid-cols-2">
          <div className="md:col-span-2 flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-800">Payment {index + 1}</p>
            <button type="button" className="text-sm text-zinc-500" onClick={() => onChange(entries.filter((item) => item.id !== entry.id))}>
              Remove
            </button>
          </div>
          <div className="space-y-2">
            <Label>Payer</Label>
            <select
              value={entry.payer_kind}
              onChange={(event) => update(entry.id, { payer_kind: event.target.value as PaymentEntryInput['payer_kind'] })}
              className="flex h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
            >
              <option value="applicant">Applicant</option>
              <option value="coapplicant">Co-applicant</option>
              <option value="bank">Bank</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Payer name</Label>
            <Input value={entry.payer_name || ''} onChange={(event) => update(entry.id, { payer_name: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Amount (₹)</Label>
            <Input type="number" min="0" step="0.01" value={entry.amount ?? ''} onChange={(event) => update(entry.id, { amount: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <select
              value={entry.status || 'received'}
              onChange={(event) => update(entry.id, { status: event.target.value as PaymentEntryInput['status'] })}
              className="flex h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
            >
              <option value="received">Received</option>
              <option value="expected">Expected</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Mode</Label>
            <select
              value={entry.payment_mode || 'Cash'}
              onChange={(event) => update(entry.id, { payment_mode: event.target.value })}
              className="flex h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm"
            >
              {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Cheque or transaction reference</Label>
            <Input value={entry.reference_no || ''} onChange={(event) => update(entry.id, { reference_no: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={(entry.payment_date || '').slice(0, 10)} onChange={(event) => update(entry.id, { payment_date: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Originating bank</Label>
            <Input value={entry.originating_bank || ''} onChange={(event) => update(entry.id, { originating_bank: event.target.value })} />
          </div>
          {entry.payment_mode === 'Other' && (
            <div className="space-y-2 md:col-span-2">
              <Label>Specify the other payment mode</Label>
              <Input value={entry.payment_mode_detail || ''} onChange={(event) => update(entry.id, { payment_mode_detail: event.target.value })} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
