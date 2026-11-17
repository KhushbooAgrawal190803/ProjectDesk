'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/ui/date-field'
import { recordDemandPayment } from './actions'

export function RecordPaymentForm({ demandNoteId }: { demandNoteId: string }) {
  const router = useRouter()
  const [principal, setPrincipal] = useState('')
  const [gst, setGst] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [paymentMode, setPaymentMode] = useState('NEFT_RTGS')
  const [otherMode, setOtherMode] = useState('')
  const [reference, setReference] = useState('')
  const [remarks, setRemarks] = useState('')
  const [pending, setPending] = useState(false)

  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault()
        setPending(true)
        try {
          const recordedRemarks = paymentMode === 'Other' && otherMode.trim()
            ? [otherMode.trim(), remarks.trim()].filter(Boolean).join(' — ')
            : remarks
          await recordDemandPayment({ demandNoteId, principal, gst, paymentDate, paymentMode, reference, remarks: recordedRemarks })
          toast.success('Payment recorded')
          setPrincipal('')
          setGst('')
          setReference('')
          setRemarks('')
          router.refresh()
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not record the payment')
        } finally {
          setPending(false)
        }
      }}
    >
      <Input value={principal} onChange={(event) => setPrincipal(event.target.value)} placeholder="Principal received" inputMode="decimal" />
      <Input value={gst} onChange={(event) => setGst(event.target.value)} placeholder="GST received" inputMode="decimal" />
      <DateField value={paymentDate} onChange={setPaymentDate} />
      <select
        value={paymentMode}
        onChange={(event) => setPaymentMode(event.target.value)}
        className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
        aria-label="Payment mode"
      >
        <option value="Cash">Cash</option>
        <option value="Cheque">Cheque</option>
        <option value="NEFT_RTGS">NEFT / RTGS</option>
        <option value="Other">Others</option>
      </select>
      {paymentMode === 'Other' && (
        <Input value={otherMode} onChange={(event) => setOtherMode(event.target.value)} placeholder="Specify the other payment mode" />
      )}
      <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Transaction or cheque number" />
      <Input value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Remarks (optional)" />
      <Button type="submit" disabled={pending} className="md:col-span-2">{pending ? 'Saving...' : 'Record payment'}</Button>
    </form>
  )
}
