'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { finalizeAgreement } from './agreement-actions'

export function FinalizeAgreementButton({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} disabled={pending}>
        Finalize agreement
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize the Agreement for Sale?</AlertDialogTitle>
            <AlertDialogDescription>
              The draft you previewed is frozen as the final version. Later edits and payments do not change it, and the payment schedule on this booking is locked against automatic recalculation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-3">
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              disabled={pending}
              onClick={async () => {
                setPending(true)
                try {
                  const result = await finalizeAgreement(bookingId)
                  toast.success(
                    result.pdfWarning
                      ? `Agreement version ${result.version} is finalized. ${result.pdfWarning}`
                      : `Agreement version ${result.version} is finalized.`
                  )
                  setOpen(false)
                  router.refresh()
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Could not finalize the agreement')
                } finally {
                  setPending(false)
                }
              }}
            >
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {pending ? 'Finalizing…' : 'Finalize'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
