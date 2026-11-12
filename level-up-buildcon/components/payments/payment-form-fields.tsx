'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { PaymentEntryInput } from '@/lib/booking/persist-details'
import { ENTRY_STATUS_LABELS, PAYMENT_MODE_LABELS, modeFields, type EntryStatus } from '@/lib/ledger/model'

export interface PayerOption {
  key: string
  label: string
  kind: PaymentEntryInput['payer_kind']
  coapplicantId?: string | null
  name?: string | null
}

export type PaymentFormValue = Omit<PaymentEntryInput, 'id'> & { id?: string }

export const selectClass =
  'flex h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:bg-zinc-50'

export function payerKey(value: Pick<PaymentEntryInput, 'payer_kind' | 'payer_coapplicant_id'>): string {
  if (value.payer_kind === 'coapplicant') return `coapplicant:${value.payer_coapplicant_id || ''}`
  return value.payer_kind
}

export function payerLabel(value: Pick<PaymentEntryInput, 'payer_kind' | 'payer_coapplicant_id' | 'payer_name'>, payers: PayerOption[]): string {
  if (value.payer_name) return value.payer_name
  return payers.find((option) => option.key === payerKey(value))?.label || 'Payer'
}

/** Payer, amount, GST, mode and the fields that mode needs, status, notes. */
export function PaymentFormFields({
  value,
  onChange,
  payers,
  statuses,
  ledgerReady,
}: {
  value: PaymentFormValue
  onChange: (patch: Partial<PaymentFormValue>) => void
  payers: PayerOption[]
  statuses: EntryStatus[]
  /** Pending, cleared and returned statuses are stored once migration 010 is run. */
  ledgerReady: boolean
}) {
  const fields = modeFields(value.payment_mode)
  const chosen = payerKey(value)
  const allowed = statuses.filter((status) => {
    if (!ledgerReady && status !== 'received') return false
    if (status === 'pending_clearance' && !fields.clearance) return false
    return true
  })
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="payment-payer">Payer</Label>
        <select
          id="payment-payer"
          className={selectClass}
          value={chosen}
          onChange={(event) => {
            const option = payers.find((item) => item.key === event.target.value)
            if (!option) return
            onChange({
              payer_kind: option.kind,
              payer_coapplicant_id: option.coapplicantId || null,
              payer_name: option.kind === 'other' ? '' : option.name || '',
            })
          }}
        >
          {payers.map((option) => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
      </div>
      {value.payer_kind === 'other' ? (
        <div className="space-y-2">
          <Label htmlFor="payment-payer-name">Payer name</Label>
          <Input id="payment-payer-name" value={value.payer_name || ''} onChange={(event) => onChange({ payer_name: event.target.value })} />
        </div>
      ) : (
        <div className="hidden md:block" />
      )}
      <div className="space-y-2">
        <Label htmlFor="payment-amount">Amount, excluding GST (₹)</Label>
        <Input
          id="payment-amount"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value.amount ?? ''}
          onChange={(event) => onChange({ amount: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="payment-gst">GST in this payment (₹)</Label>
        <Input
          id="payment-gst"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value.gst_amount ?? ''}
          onChange={(event) => onChange({ gst_amount: event.target.value })}
          placeholder="0.00"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="payment-mode">Mode</Label>
        <select
          id="payment-mode"
          className={selectClass}
          value={value.payment_mode || 'NEFT_RTGS'}
          onChange={(event) => {
            const mode = event.target.value
            const next = modeFields(mode)
            onChange({
              payment_mode: mode,
              originating_bank: next.bank ? value.originating_bank : '',
              status: !next.clearance && value.status === 'pending_clearance' ? 'received' : value.status,
            })
          }}
        >
          {Object.entries(PAYMENT_MODE_LABELS).map(([mode, label]) => (
            <option key={mode} value={mode}>{label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="payment-date">Date</Label>
        <Input id="payment-date" type="date" value={(value.payment_date || '').slice(0, 10)} onChange={(event) => onChange({ payment_date: event.target.value })} />
      </div>
      {value.payment_mode === 'Other' && (
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="payment-mode-detail">Specify the payment mode</Label>
          <Input
            id="payment-mode-detail"
            value={value.payment_mode_detail || ''}
            onChange={(event) => onChange({ payment_mode_detail: event.target.value })}
            placeholder="For example, demand draft"
          />
        </div>
      )}
      {fields.reference && (
        <div className="space-y-2">
          <Label htmlFor="payment-reference">{fields.reference}</Label>
          <Input id="payment-reference" value={value.reference_no || ''} onChange={(event) => onChange({ reference_no: event.target.value })} />
        </div>
      )}
      {fields.bank && (
        <div className="space-y-2">
          <Label htmlFor="payment-bank">{value.payment_mode === 'Cheque' ? 'Bank the cheque is drawn on' : 'Bank'}</Label>
          <Input id="payment-bank" value={value.originating_bank || ''} onChange={(event) => onChange({ originating_bank: event.target.value })} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="payment-status">Status</Label>
        <select
          id="payment-status"
          className={selectClass}
          value={allowed.includes((value.status || 'received') as EntryStatus) ? value.status || 'received' : allowed[0]}
          onChange={(event) => onChange({ status: event.target.value as EntryStatus })}
        >
          {allowed.map((status) => (
            <option key={status} value={status}>{ENTRY_STATUS_LABELS[status]}</option>
          ))}
        </select>
        {!ledgerReady && (
          <p className="text-xs text-zinc-500">Pending clearance and returned payments become available after the payment ledger update is installed.</p>
        )}
        {value.status === 'pending_clearance' && (
          <p className="text-xs text-amber-700">Shown separately and not counted as received until it is cleared.</p>
        )}
        {value.status === 'returned' && (
          <p className="text-xs text-zinc-500">Kept for the record. It is not counted as received.</p>
        )}
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="payment-notes">Notes</Label>
        <Textarea id="payment-notes" rows={2} value={value.notes || ''} onChange={(event) => onChange({ notes: event.target.value })} />
      </div>
    </div>
  )
}

/** A short error for an incomplete payment, or null. */
export function paymentProblem(value: PaymentFormValue, payers: PayerOption[]): string | null {
  const amount = Number(value.amount || 0)
  const gst = Number(value.gst_amount || 0)
  if (!payers.some((option) => option.key === payerKey(value))) return 'Choose who paid.'
  if (value.payer_kind === 'other' && !String(value.payer_name || '').trim()) return 'Enter the payer name.'
  if (!Number.isFinite(amount) || !Number.isFinite(gst) || amount < 0 || gst < 0) return 'Amounts cannot be negative.'
  if (amount <= 0 && gst <= 0) return 'Enter an amount.'
  if (!value.payment_date) return 'Enter the payment date.'
  if (!value.payment_mode) return 'Choose a payment mode.'
  return null
}
