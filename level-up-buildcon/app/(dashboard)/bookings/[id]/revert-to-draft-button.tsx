'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { Undo2, Loader2 } from 'lucide-react'
import { revertToDraft } from '../actions'

interface RevertToDraftButtonProps {
  bookingId: string
  canRevert: boolean
  bookingStatus: string
}

export function RevertToDraftButton({ bookingId, canRevert, bookingStatus }: RevertToDraftButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [reason, setReason] = useState('')

  const handleRevert = async () => {
    setReverting(true)
    try {
      await revertToDraft(bookingId, reason || undefined)
      toast.success('Booking sent back to drafts', {
        description: 'The creator can now edit and resubmit it from New Booking page.',
      })
      router.push('/bookings')
    } catch (error: any) {
      toast.error('Failed to revert booking', {
        description: error.message,
      })
    } finally {
      setReverting(false)
      setOpen(false)
    }
  }

  // Only show for submitted/edited bookings when user has permission
  if (!canRevert || bookingStatus === 'DRAFT') return null

  return (
    <>
      <Button
        variant="outline"
        className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
        onClick={() => setOpen(true)}
      >
        <Undo2 className="w-4 h-4" />
        Back to Draft
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Back to Drafts?</AlertDialogTitle>
            <AlertDialogDescription>
              This booking will be moved back to draft status. The original creator will find it in their drafts on the New Booking page, where they can edit and resubmit it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-sm font-medium">
                Reason (optional)
              </Label>
              <Textarea
                id="reason"
                placeholder="e.g. Wrong unit number, need to update pricing..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={handleRevert}
              disabled={reverting}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {reverting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {reverting ? 'Reverting...' : 'Send to Drafts'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
