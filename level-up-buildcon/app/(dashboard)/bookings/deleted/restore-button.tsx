'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { RotateCcw, Loader2 } from 'lucide-react'
import { restoreBooking } from '../actions'

interface RestoreBookingButtonProps {
  bookingId: string
  bookingSerial: string
}

export function RestoreBookingButton({ bookingId, bookingSerial }: RestoreBookingButtonProps) {
  const router = useRouter()
  const [restoring, setRestoring] = useState(false)

  const handleRestore = async () => {
    setRestoring(true)
    try {
      await restoreBooking(bookingId)
      toast.success(`Booking ${bookingSerial} restored successfully`)
      router.refresh()
    } catch (error: any) {
      toast.error('Failed to restore booking', {
        description: error.message,
      })
    } finally {
      setRestoring(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRestore}
      disabled={restoring}
      className="gap-2"
    >
      {restoring && <Loader2 className="w-4 h-4 animate-spin" />}
      {restoring ? 'Restoring...' : (
        <>
          <RotateCcw className="w-4 h-4" />
          Restore
        </>
      )}
    </Button>
  )
}
