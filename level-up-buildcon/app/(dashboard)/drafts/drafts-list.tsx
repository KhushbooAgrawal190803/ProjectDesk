'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow, format } from 'date-fns'
import { FileText, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatInr } from '@/lib/booking/money'
import { deleteDraft } from '../new-booking/actions'

export interface DraftRow {
  id: string
  status: string
  own: boolean
  creator: string | null
  updatedAt: string
  unit: string | null
  project: string
  applicant: string | null
  mobile: string | null
  /** Total Consideration, excluding GST, when a price has been entered. */
  price: string | null
  /** How many of unit, applicant, contact and price are filled in (out of 4). */
  completed: number
  missing: string[]
}

const MISSING_LABELS: Record<string, string> = {
  unit: 'flat',
  applicant: 'applicant',
  contact: 'mobile',
  price: 'price',
}

export function DraftsList({ rows, showCreator }: { rows: DraftRow[]; showCreator: boolean }) {
  const router = useRouter()
  const [term, setTerm] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) =>
      [row.applicant, row.unit, row.mobile, row.creator, row.project].some((value) => value?.toLowerCase().includes(needle))
    )
  }, [rows, term])

  const remove = async (row: DraftRow) => {
    const label = row.applicant || row.unit || 'this draft'
    if (!window.confirm(`Delete the draft for ${label}? This cannot be undone.`)) return
    setRemoving(row.id)
    try {
      await deleteDraft(row.id)
      toast.success('Draft deleted')
      startTransition(() => router.refresh())
    } catch {
      toast.error('Failed to delete draft')
    } finally {
      setRemoving(null)
    }
  }

  if (!rows.length) {
    return (
      <Card className="flex flex-col items-center gap-3 border-zinc-200 px-6 py-14 text-center shadow-sm">
        <FileText className="h-8 w-8 text-zinc-300" />
        <p className="font-medium text-zinc-900">No drafts</p>
        <p className="max-w-sm text-sm text-zinc-500">A draft is created as soon as you start filling in a new booking, and is kept here until it is submitted.</p>
        <Link href="/new-booking">
          <Button className="mt-2 gap-2"><Plus className="h-4 w-4" />New Booking</Button>
        </Link>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search applicant, flat or mobile" className="pl-9" />
        </div>
        <p className="text-sm text-zinc-500">
          {visible.length} of {rows.length} draft{rows.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="space-y-3">
        {visible.map((row) => {
          const updated = new Date(row.updatedAt)
          const pending = row.status === 'PENDING'
          return (
            <Card key={row.id} className="border-zinc-200 px-5 py-4 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-zinc-900">{row.applicant || 'No applicant yet'}</p>
                    {row.unit && <Badge variant="outline" className="border-zinc-200 text-zinc-700">{row.unit}</Badge>}
                    {pending && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Awaiting approval</Badge>}
                  </div>
                  <p className="text-sm text-zinc-500">
                    {[row.project, row.mobile, row.price ? `${formatInr(row.price)} + GST` : null].filter(Boolean).join(' · ')}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                    <span title={format(updated, 'd MMM yyyy, h:mm a')}>Saved {formatDistanceToNow(updated, { addSuffix: true })}</span>
                    {showCreator && row.creator && <span>Started by {row.creator}</span>}
                    <span className="flex items-center gap-1.5">
                      <span className="flex gap-0.5" aria-hidden>
                        {[0, 1, 2, 3].map((index) => (
                          <span key={index} className={`h-1.5 w-4 rounded-full ${index < row.completed ? 'bg-zinc-900' : 'bg-zinc-200'}`} />
                        ))}
                      </span>
                      {row.missing.length ? `Missing ${row.missing.map((key) => MISSING_LABELS[key]).join(', ')}` : 'Basics complete'}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {row.own && row.status === 'DRAFT' && (
                    <Button variant="outline" size="sm" onClick={() => remove(row)} disabled={removing === row.id} aria-label="Delete draft">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Link href={`/new-booking?draftId=${row.id}`}>
                    <Button size="sm">Continue</Button>
                  </Link>
                </div>
              </div>
            </Card>
          )
        })}
        {!visible.length && <p className="py-8 text-center text-sm text-zinc-500">No drafts match “{term}”.</p>}
      </div>
    </div>
  )
}
