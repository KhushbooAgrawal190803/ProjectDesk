'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { allocateBookingAdvance } from '@/app/(dashboard)/demand-notes/actions'

export function AllocateAdvanceForm({
  bookingId,
  installments,
}: {
  bookingId: string
  installments: Array<{ id: string; label: string }>
}) {
  const router = useRouter()
  const [scheduleRowId, setScheduleRowId] = useState(installments[0]?.id || '')
  const [principal, setPrincipal] = useState('')
  const [gst, setGst] = useState('')
  const [pending, setPending] = useState(false)

  return (
    <form
      className="grid gap-3 md:grid-cols-4"
      onSubmit={async (event) => {
        event.preventDefault()
        setPending(true)
        try {
          await allocateBookingAdvance({ bookingId, scheduleRowId, principal, gst })
          toast.success('Booking amount allocated. The original receipt is unchanged.')
          setPrincipal('')
          setGst('')
          router.refresh()
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not allocate the receipt')
        } finally {
          setPending(false)
        }
      }}
    >
      <select
        value={scheduleRowId}
        onChange={(event) => setScheduleRowId(event.target.value)}
        className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
        aria-label="Installment"
      >
        {installments.map((item) => (
          <option key={item.id} value={item.id}>{item.label}</option>
        ))}
      </select>
      <Input value={principal} onChange={(event) => setPrincipal(event.target.value)} placeholder="Principal" inputMode="decimal" />
      <Input value={gst} onChange={(event) => setGst(event.target.value)} placeholder="GST" inputMode="decimal" />
      <Button type="submit" disabled={pending || !scheduleRowId}>{pending ? 'Saving...' : 'Allocate'}</Button>
    </form>
  )
}
