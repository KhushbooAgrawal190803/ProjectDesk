'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatInr } from '@/lib/booking/money'
import {
  applyReceiptAllocation,
  previewReceiptAllocation,
  reverseAllocation,
  setReceiptClearance,
  type AllocationPreviewRow,
} from '@/app/(dashboard)/bookings/[id]/payment-actions'

/** Shows where unapplied received money would go, and applies it only after confirmation. */
export function ApplyReceivedMoney({ bookingId, unappliedLabel }: { bookingId: string; unappliedLabel: string }) {
  const router = useRouter()
  const [rows, setRows] = useState<AllocationPreviewRow[] | null>(null)
  const [busy, setBusy] = useState(false)

  const preview = async () => {
    setBusy(true)
    try {
      setRows(await previewReceiptAllocation(bookingId))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not prepare the allocation')
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    setBusy(true)
    try {
      const result = await applyReceiptAllocation(bookingId)
      toast.success(`Applied to ${result.applied} installment row${result.applied === 1 ? '' : 's'}`)
      setRows(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not apply the money')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm text-amber-900">{unappliedLabel}</p>
      <Button variant="outline" size="sm" onClick={preview} disabled={busy}>
        {busy && rows == null ? 'Preparing…' : 'Review and apply'}
      </Button>
      <Dialog open={rows != null} onOpenChange={(next) => !next && setRows(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Apply received money</DialogTitle>
            <DialogDescription>
              Cleared money is applied to installments in schedule order, starting with the booking installment. Principal and GST are applied separately. Nothing changes until you confirm.
            </DialogDescription>
          </DialogHeader>
          {rows && rows.length === 0 ? (
            <p className="text-sm text-zinc-600">There is nothing to apply. Every cleared payment is already applied, or the installments are fully paid.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="py-1 pr-2 font-medium">From payment</th>
                    <th className="py-1 pr-2 font-medium">To installment</th>
                    <th className="py-1 pr-2 text-right font-medium">Principal</th>
                    <th className="py-1 text-right font-medium">GST</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {(rows || []).map((row) => (
                    <tr key={`${row.receiptId}-${row.scheduleRowId}`}>
                      <td className="py-2 pr-2 text-zinc-600">{row.receiptLabel}</td>
                      <td className="py-2 pr-2">{row.installmentLabel}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatInr(row.principal)}</td>
                      <td className="py-2 text-right tabular-nums">{formatInr(row.gst)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRows(null)} disabled={busy}>Cancel</Button>
            {rows && rows.length > 0 && (
              <Button onClick={apply} disabled={busy}>{busy ? 'Applying…' : 'Confirm and apply'}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function ClearanceButtons({ bookingId, receiptId }: { bookingId: string; receiptId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const act = async (status: 'cleared' | 'returned') => {
    if (status === 'returned' && !window.confirm('Mark this payment as failed / returned? It will not be counted as received.')) return
    setBusy(status)
    try {
      await setReceiptClearance({ bookingId, receiptId, status })
      toast.success(status === 'cleared' ? 'Marked cleared and applied to installments' : 'Marked failed / returned')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the payment')
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="inline-flex gap-1">
      <Button size="sm" variant="outline" onClick={() => act('cleared')} disabled={busy != null}>{busy === 'cleared' ? 'Saving…' : 'Mark cleared'}</Button>
      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => act('returned')} disabled={busy != null}>Returned</Button>
    </div>
  )
}

export function ReverseAllocationButton({ bookingId, allocationId }: { bookingId: string; allocationId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs text-zinc-500"
      disabled={busy}
      onClick={async () => {
        const reason = window.prompt('Why is this allocation being removed? The payment itself is kept.')
        if (!reason) return
        setBusy(true)
        try {
          await reverseAllocation({ bookingId, allocationId, reason })
          toast.success('Allocation removed. The payment is kept as unapplied credit.')
          router.refresh()
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not remove the allocation')
        } finally {
          setBusy(false)
        }
      }}
    >
      Undo
    </Button>
  )
}
