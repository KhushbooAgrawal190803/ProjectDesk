'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function partsOf(value?: string): { year: string; month: string; day: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
  if (!match) return { year: '', month: '', day: '' }
  return { year: match[1], month: String(Number(match[2])), day: String(Number(match[3])) }
}

function toIso(year: string, month: string, day: string): string {
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  if (!y || !m || !d) return ''
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return ''
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Day, month and year, with a large month calendar. The stored value stays YYYY-MM-DD. */
export function DateField({
  id,
  name,
  value,
  defaultValue,
  onChange,
  className,
}: {
  id?: string
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (iso: string) => void
  className?: string
}) {
  const [internal, setInternal] = useState(defaultValue || '')
  const current = value !== undefined ? value : internal
  const [draft, setDraft] = useState(() => partsOf(current))
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(current)) return
    const parsed = partsOf(current)
    setDraft((previous) => (toIso(previous.year, previous.month, previous.day) === current.slice(0, 10) ? previous : parsed))
  }, [current])
  const change = (next: { year: string; month: string; day: string }) => {
    setDraft(next)
    const iso = toIso(next.year, next.month, next.day)
    setInternal(iso)
    onChange?.(iso)
  }
  const today = new Date()
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState({
    year: Number(draft.year) || today.getFullYear(),
    month: Number(draft.month) || today.getMonth() + 1,
  })
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const cells = useMemo(() => {
    const count = daysInMonth(cursor.year, cursor.month)
    const first = new Date(cursor.year, cursor.month - 1, 1).getDay()
    const mondayFirst = first === 0 ? 6 : first - 1
    return [...Array(mondayFirst).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)]
  }, [cursor])

  const setPart = (part: 'day' | 'month' | 'year', next: string) => {
    const updated = { ...draft, [part]: next }
    change(updated)
    if (part !== 'day' && next) {
      setCursor({
        year: Number(updated.year) || cursor.year,
        month: Number(updated.month) || cursor.month,
      })
    }
  }

  const pick = (day: number) => {
    change({ year: String(cursor.year), month: String(cursor.month), day: String(day) })
    setOpen(false)
  }

  const shift = (delta: number) => {
    const date = new Date(cursor.year, cursor.month - 1 + delta, 1)
    setCursor({ year: date.getFullYear(), month: date.getMonth() + 1 })
  }

  return (
    <div ref={root} className={cn('relative', className)}>
      {name && <input type="hidden" name={name} value={current} />}
      <div className="grid grid-cols-[4.5rem_1fr_5.5rem] gap-2">
        <select
          id={id}
          aria-label="Day"
          value={draft.day}
          onChange={(event) => setPart('day', event.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="">Day</option>
          {Array.from({ length: 31 }, (_, index) => (
            <option key={index + 1} value={String(index + 1)}>{index + 1}</option>
          ))}
        </select>
        <select
          aria-label="Month"
          value={draft.month}
          onChange={(event) => setPart('month', event.target.value)}
          onFocus={() => setOpen(true)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="">Month</option>
          {MONTHS.map((name, index) => (
            <option key={name} value={String(index + 1)}>{name}</option>
          ))}
        </select>
        <input
          aria-label="Year"
          inputMode="numeric"
          placeholder="Year"
          value={draft.year}
          onChange={(event) => setPart('year', event.target.value.replace(/\D/g, '').slice(0, 4))}
          onFocus={() => setOpen(true)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        />
      </div>
      {open && (
        <div className="absolute z-30 mt-2 w-[22rem] rounded-lg border border-zinc-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => shift(-1)} className="rounded p-1 hover:bg-zinc-100" aria-label="Previous month">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium">{MONTHS[cursor.month - 1]} {cursor.year}</span>
            <button type="button" onClick={() => shift(1)} className="rounded p-1 hover:bg-zinc-100" aria-label="Next month">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-500">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) => (
              <div key={label} className="py-1">{label}</div>
            ))}
            {cells.map((day, index) => (
              <button
                key={index}
                type="button"
                disabled={!day}
                onClick={() => day && pick(day)}
                className={cn(
                  'h-10 rounded-md text-sm',
                  day ? 'hover:bg-zinc-100' : 'cursor-default',
                  day && draft.day === String(day) && draft.month === String(cursor.month) && draft.year === String(cursor.year) && 'bg-zinc-900 text-white hover:bg-zinc-900'
                )}
              >
                {day || ''}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
