'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, RefreshCw, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { resendEmail, retryEmail, sendAwaitingEmail } from '../../email-actions'

export function EventActions({ eventId, failedCount, awaiting, activeRecipients }: { eventId: string; failedCount: number; awaiting: boolean; activeRecipients: string[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmResend, setConfirmResend] = useState(false)

  const run = async (key: string, work: () => Promise<{ message: string; eventId?: string | null }>) => {
    setBusy(key)
    try {
      const result = await work()
      toast.success(result.message)
      if (result.eventId) router.push(`/admin/email/${result.eventId}`)
      else router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {awaiting && (
        <Button
          className="gap-2"
          disabled={busy != null || !activeRecipients.length}
          onClick={() => run('awaiting', async () => {
            const result = await sendAwaitingEmail(eventId)
            return { message: `Email queued for ${result.recipients.length} company recipient${result.recipients.length === 1 ? '' : 's'}.` }
          })}
        >
          {busy === 'awaiting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send to current recipients
        </Button>
      )}
      {failedCount > 0 && (
        <Button
          variant="outline"
          className="gap-2"
          disabled={busy != null}
          onClick={() => run('retry', async () => {
            const result = await retryEmail(eventId)
            return { message: `Retrying ${result.retried} failed recipient${result.retried === 1 ? '' : 's'}. Recipients already sent are not emailed again.` }
          })}
        >
          {busy === 'retry' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Retry failed ({failedCount})
        </Button>
      )}
      <Button variant="outline" className="gap-2" disabled={busy != null || !activeRecipients.length} onClick={() => setConfirmResend(true)}>
        <Send className="h-4 w-4" />
        Resend
      </Button>
      <AlertDialog open={confirmResend} onOpenChange={(open) => busy == null && setConfirmResend(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resend this email?</AlertDialogTitle>
            <AlertDialogDescription>
              The same documents are sent again as a new, separately recorded email to every active company recipient.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-0.5 text-sm text-zinc-700">
            {activeRecipients.map((email) => <li key={email}>{email}</li>)}
          </ul>
          <div className="flex justify-end gap-3">
            <AlertDialogCancel disabled={busy != null}>Cancel</AlertDialogCancel>
            <Button
              disabled={busy != null}
              onClick={() => run('resend', async () => {
                const result = await resendEmail(eventId)
                setConfirmResend(false)
                return { message: `Email queued for ${result.recipients.length} company recipient${result.recipients.length === 1 ? '' : 's'}.`, eventId: result.eventId }
              })}
            >
              {busy === 'resend' ? 'Queuing…' : 'Resend'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
