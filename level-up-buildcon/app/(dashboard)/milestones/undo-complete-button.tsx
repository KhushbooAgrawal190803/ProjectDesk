'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { markMilestoneNotCompleted, previewMilestoneUndo } from './actions'

export function UndoCompleteButton({ id, label }: { id: string; label: string }) {
  const router = useRouter()
  const [preview, setPreview] = useState<{ withdraw: string[]; keep: string[] } | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const open = async () => {
    setBusy(true)
    try {
      setPreview(await previewMilestoneUndo(id))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not check this milestone')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    setBusy(true)
    try {
      const result = await markMilestoneNotCompleted(id, reason)
      toast.success(
        `“${label}” is pending again.${result.withdrawn ? ` Withdrew ${result.withdrawn} demand note${result.withdrawn === 1 ? '' : 's'}.` : ''}${result.kept ? ` Kept ${result.kept} with payments applied.` : ''}`
      )
      setPreview(null)
      setReason('')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the milestone')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={open} disabled={busy}>
        {busy && !preview ? 'Checking…' : 'Mark not completed'}
      </Button>
      <AlertDialog open={preview != null} onOpenChange={(next) => !busy && !next && setPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark “{label}” not completed?</AlertDialogTitle>
            <AlertDialogDescription>
              The milestone goes back to pending and its installment is no longer due on any booking. When it is marked completed again, demand notes are issued afresh.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {preview && (
            <div className="space-y-3 text-sm">
              {preview.withdraw.length > 0 ? (
                <div>
                  <p className="font-medium text-zinc-900">{preview.withdraw.length} unpaid demand note{preview.withdraw.length === 1 ? '' : 's'} will be withdrawn</p>
                  <p className="mt-1 text-xs text-zinc-500">{preview.withdraw.join(', ')}</p>
                </div>
              ) : (
                <p className="text-zinc-600">No unpaid demand notes to withdraw.</p>
              )}
              {preview.keep.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  <p className="font-medium">{preview.keep.length} note{preview.keep.length === 1 ? '' : 's'} will be kept, because a payment is applied to {preview.keep.length === 1 ? 'it' : 'them'}</p>
                  <p className="mt-1 text-xs">{preview.keep.join(', ')}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor={`undo-reason-${id}`}>Reason</Label>
                <Textarea
                  id={`undo-reason-${id}`}
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="For example, marked completed by mistake"
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button onClick={confirm} disabled={busy || !reason.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {busy ? 'Saving…' : 'Mark not completed'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
