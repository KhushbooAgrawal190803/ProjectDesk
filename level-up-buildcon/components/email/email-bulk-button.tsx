'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { ManualCategory } from '@/lib/email/documents'
import { previewManualEmail, sendManualEmail } from '@/app/(dashboard)/admin/email-actions'

/** Email a whole category to the company recipients, after showing exactly who and how many. */
export function EmailBulkButton({
  category,
  groupKey = null,
  label,
  noun = 'Documents',
  disabled,
  className,
}: {
  category: ManualCategory
  groupKey?: string | null
  label: string
  noun?: string
  disabled?: boolean
  className?: string
}) {
  const [preview, setPreview] = useState<{ documents: number; omitted: number; recipients: string[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const open = async () => {
    setBusy(true)
    try {
      setPreview(await previewManualEmail(category, groupKey))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not prepare the email')
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    setBusy(true)
    try {
      const result = await sendManualEmail(category, groupKey)
      if (result.status === 'awaiting_recipients') toast.warning('Saved as Awaiting Recipients. Add a company recipient in Admin → Email Delivery.')
      else toast.success(`Email queued for ${result.recipients} company recipient${result.recipients === 1 ? '' : 's'}.`)
      setPreview(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The email could not be queued')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" className={`gap-2 ${className || ''}`} onClick={open} disabled={disabled || busy}>
        {busy && !preview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {label}
      </Button>
      <AlertDialog open={preview != null} onOpenChange={(next) => !busy && !next && setPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Email {preview?.documents ?? 0} {noun}?</AlertDialogTitle>
            <AlertDialogDescription>One email with every document, sent to each active company address. Nothing goes to purchasers or banks.</AlertDialogDescription>
          </AlertDialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-zinc-900">Recipients: {preview.recipients.length} active company address{preview.recipients.length === 1 ? '' : 'es'}</p>
                {preview.recipients.length ? (
                  <ul className="mt-1 space-y-0.5 text-zinc-600">{preview.recipients.map((email) => <li key={email}>{email}</li>)}</ul>
                ) : (
                  <p className="mt-1 text-amber-700">No active recipients. The email will wait as Awaiting Recipients.</p>
                )}
              </div>
              <p><span className="font-medium text-zinc-900">Documents:</span> {preview.documents}</p>
              <p><span className="font-medium text-zinc-900">Category:</span> {label.replace(/^Email (All )?/, '')}</p>
              {preview.omitted > 0 && <p className="text-amber-700">{preview.omitted} document{preview.omitted === 1 ? ' is' : 's are'} not ready and will be listed in the email as not included.</p>}
              {preview.documents > 10 && <p className="text-zinc-500">Large batches are sent as one ZIP, or a secure download link if too big to attach.</p>}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button onClick={send} disabled={busy || !preview?.documents}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {busy ? 'Queuing…' : 'Send Email'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
