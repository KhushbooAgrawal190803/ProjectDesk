'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { finalizeAgreement } from './agreement-actions'

export function FinalizeAgreementButton({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true)
        try {
          const result = await finalizeAgreement(bookingId)
          toast.success(
            result.pdfWarning
              ? `Agreement version ${result.version} is frozen. ${result.pdfWarning}`
              : `Agreement version ${result.version} is frozen.`
          )
          router.refresh()
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not finalize the agreement')
        } finally {
          setPending(false)
        }
      }}
    >
      {pending ? 'Saving...' : 'Finalize agreement'}
    </Button>
  )
}
