'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DateField } from '@/components/ui/date-field'
import { AmountInput } from '@/components/ui/amount-input'
import { modeFields, PAYMENT_MODE_LABELS } from '@/lib/ledger/model'
import { editPaymentReceipt } from '@/app/(dashboard)/bookings/[id]/payment-actions'

export interface EditablePayment {
  id: string
  /** Plain amounts, e.g. "990000.00". */
  principal: string
  gst: string
  date: string
  mode: string | null
  reference: string | null
  bankName: string | null
  payerName: string | null
  notes: string | null
  /** booking_advance when it came from the booking form. */
  source: string
  applied: string
}

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900'

/** Admin only: correct a payment already recorded. The reason and the before/after values go to the booking's history. */
export function EditPaymentButton({ bookingId, payment }: { bookingId: string; payment: EditablePayment }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const initial = () => ({
    principal: payment.principal,
    gst: payment.gst,
    date: payment.date,
    mode: payment.mode || 'NEFT_RTGS',
    reference: payment.reference || '',
    bankName: payment.bankName || '',
    payerName: payment.payerName || '',
    notes: payment.notes || '',
    reason: '',
  })
  const [form, setForm] = useState(initial)
  const set = (patch: Partial<ReturnType<typeof initial>>) => setForm((current) => ({ ...current, ...patch }))
  const fields = modeFields(form.mode)

  const save = async () => {
    if (!form.reason.trim()) {
      toast.error('Give a reason for the change')
      return
    }
    setBusy(true)
    try {
      const result = await editPaymentReceipt({
        bookingId,
        receiptId: payment.id,
        principal: form.principal,
        gst: form.gst,
        paymentDate: form.date,
        paymentMode: form.mode,
        reference: form.reference,
        bankName: form.bankName,
        payerName: form.payerName,
        notes: form.notes,
        reason: form.reason,
      })
      if (!result.changed) toast.info('Nothing was changed')
      else toast.success(result.reapplied ? 'Payment updated and re-applied to installments' : 'Payment updated')
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the payment')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-xs text-zinc-600"
        onClick={() => {
          setForm(initial())
          setOpen(true)
        }}
      >
        <Pencil className="h-3 w-3" />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit payment</DialogTitle>
            <DialogDescription>
              Corrections are saved with your reason and the old values in this booking&apos;s History. If you lower the amount below what this payment has
              already paid off, it is re-applied to installments in schedule order.
            </DialogDescription>
          </DialogHeader>
          {payment.source === 'booking_advance' && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              This is the booking amount from the booking form. Changing the amount here does not change the booking form; if they differ, the booking page
              will point it out.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-payment-amount">Amount, excluding GST (₹)</Label>
              <AmountInput id="edit-payment-amount" value={form.principal} onValueChange={(principal) => set({ principal })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-payment-gst">GST (₹)</Label>
              <AmountInput id="edit-payment-gst" value={form.gst} onValueChange={(gst) => set({ gst })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-payment-date">Payment date</Label>
              <DateField id="edit-payment-date" value={form.date} onChange={(date) => set({ date })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-payment-mode">Mode</Label>
              <select id="edit-payment-mode" value={form.mode} onChange={(event) => set({ mode: event.target.value })} className={SELECT_CLASS}>
                {Object.entries(PAYMENT_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-payment-reference">{fields.reference || 'Reference'}</Label>
              <Input id="edit-payment-reference" value={form.reference} onChange={(event) => set({ reference: event.target.value })} />
            </div>
            {fields.bank && (
              <div className="space-y-1.5">
                <Label htmlFor="edit-payment-bank">Bank</Label>
                <Input id="edit-payment-bank" value={form.bankName} onChange={(event) => set({ bankName: event.target.value })} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="edit-payment-payer">Payer name</Label>
              <Input id="edit-payment-payer" value={form.payerName} onChange={(event) => set({ payerName: event.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="edit-payment-notes">Notes</Label>
              <Input id="edit-payment-notes" value={form.notes} onChange={(event) => set({ notes: event.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="edit-payment-reason">Reason for the change (required)</Label>
              <Textarea
                id="edit-payment-reason"
                value={form.reason}
                onChange={(event) => set({ reason: event.target.value })}
                placeholder="e.g. Cheque amount was entered wrongly; corrected from the bank statement"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
