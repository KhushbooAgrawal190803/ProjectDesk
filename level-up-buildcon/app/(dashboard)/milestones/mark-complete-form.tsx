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
import { markMilestoneComplete } from './actions'

export function MarkCompleteForm({ id, label, today, affectedBookings }: { id: string; label: string; today: string; affectedBookings: number }) {
  const router = useRouter()
  const [date, setDate] = useState(today)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  const confirm = async () => {
    setPending(true)
    try {
      const result = await markMilestoneComplete(id, date)
      if (result.failed.length) {
        toast.error(`Milestone completed, but ${result.failed.length} booking${result.failed.length === 1 ? '' : 's'} could not be checked`, {
          description: result.failed[0],
        })
      } else {
        const email = result.emailed.queued
          ? ` Email queued for ${result.emailed.recipients} company recipient${result.emailed.recipients === 1 ? '' : 's'}.`
          : result.emailed.awaiting
            ? ' The email is waiting for a company recipient (Admin → Email Delivery).'
            : ''
        toast.success(
          result.issued.length
            ? `Milestone completed. Issued ${result.issued.length} demand note${result.issued.length === 1 ? '' : 's'}.${email}`
            : `Milestone completed. ${result.checked} booking${result.checked === 1 ? '' : 's'} checked; no new demand note was needed.`
        )
      }
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the milestone')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        max={today}
        value={date}
        onChange={(event) => setDate(event.target.value)}
        className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
        aria-label="Completion date"
      />
      <Button type="button" onClick={() => setOpen(true)} disabled={!date}>Mark completed</Button>
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark “{label}” completed?</AlertDialogTitle>
            <AlertDialogDescription>
              Completion date {date.split('-').reverse().join('.')}. This installment becomes due on {affectedBookings} active booking{affectedBookings === 1 ? '' : 's'}, and a demand note is issued for each one with money outstanding. If this is a mistake, an admin can mark it not completed later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-3">
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button onClick={confirm} disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {pending ? 'Issuing notes…' : 'Mark completed'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
