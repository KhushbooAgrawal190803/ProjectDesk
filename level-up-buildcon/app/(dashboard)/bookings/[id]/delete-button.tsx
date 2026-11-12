'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { Trash2, Loader2 } from 'lucide-react'
import { deleteBooking } from '../actions'

interface DeleteBookingButtonProps {
  bookingId: string
  canDelete: boolean
  /** Controlled from a menu; the button itself is not shown. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DeleteBookingButton({ bookingId, canDelete, open: controlledOpen, onOpenChange }: DeleteBookingButtonProps) {
  const router = useRouter()
  const [ownOpen, setOwnOpen] = useState(false)
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : ownOpen
  const setOpen = (next: boolean) => (controlled ? onOpenChange?.(next) : setOwnOpen(next))
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteBooking(bookingId)
      toast.success('Booking deleted successfully')
      router.push('/bookings')
    } catch (error: any) {
      toast.error('Failed to delete booking', {
        description: error.message,
      })
    } finally {
      setDeleting(false)
      setOpen(false)
    }
  }

  if (!canDelete) return null

  return (
    <>
      {!controlled && (
        <Button
          variant="destructive"
          className="gap-2"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </Button>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This booking will be moved to the deleted items. Admins can restore it from the deleted bookings page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
