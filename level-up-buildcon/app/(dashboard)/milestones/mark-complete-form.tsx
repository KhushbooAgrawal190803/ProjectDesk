'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { markMilestoneComplete } from './actions'

export function MarkCompleteForm({ id, today }: { id: string; today: string }) {
  const router = useRouter()
  const [date, setDate] = useState(today)
  const [pending, setPending] = useState(false)

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault()
        setPending(true)
        try {
          const result = await markMilestoneComplete(id, date)
          toast.success(
            result.issued.length
              ? `Milestone completed. Issued ${result.issued.length} demand note${result.issued.length === 1 ? '' : 's'}.`
              : 'Milestone completed. No new demand note was needed.'
          )
          router.refresh()
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not update the milestone')
        } finally {
          setPending(false)
        }
      }}
    >
      <input
        type="date"
        max={today}
        value={date}
        onChange={(event) => setDate(event.target.value)}
        className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
        aria-label="Completion date"
      />
      <Button type="submit" disabled={pending}>{pending ? 'Saving...' : 'Mark completed'}</Button>
    </form>
  )
}
