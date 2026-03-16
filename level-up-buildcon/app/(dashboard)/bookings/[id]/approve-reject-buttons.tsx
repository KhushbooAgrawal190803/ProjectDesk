'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { CheckCircle, XCircle } from 'lucide-react'
import { approveBooking, rejectBooking } from '../actions'

interface ApproveRejectButtonsProps {
  bookingId: string
}

export function ApproveRejectButtons({ bookingId }: ApproveRejectButtonsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const handleApprove = async () => {
    setLoading(true)
    try {
      await approveBooking(bookingId)
      toast.success('Booking approved')
      router.refresh()
    } catch (error: any) {
      toast.error('Failed to approve', {
        description: error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    setLoading(true)
    try {
      await rejectBooking(bookingId, rejectReason || undefined)
      toast.success('Booking rejected and sent back to drafts')
      setRejectDialogOpen(false)
      router.refresh()
    } catch (error: any) {
      toast.error('Failed to reject', {
        description: error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        onClick={handleApprove}
        disabled={loading}
        className="gap-2 bg-green-600 hover:bg-green-700"
      >
        <CheckCircle className="w-4 h-4" />
        Approve
      </Button>
      <Button
        onClick={() => setRejectDialogOpen(true)}
        disabled={loading}
        variant="destructive"
        className="gap-2"
      >
        <XCircle className="w-4 h-4" />
        Reject
      </Button>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Booking</DialogTitle>
            <DialogDescription>
              This will send the booking back to drafts so the executive can fix and resubmit it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Textarea
                id="reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={loading}
            >
              {loading ? 'Rejecting...' : 'Reject Booking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
