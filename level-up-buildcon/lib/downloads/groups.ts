import type { SupabaseClient } from '@supabase/supabase-js'

export interface DemandGroupSource {
  id?: string
  trigger: string
  due: boolean
  noteId?: string | null
  /** Stable group key, e.g. milestone:AGREEMENT or date:2026-12-20. Defaults to the trigger text. */
  key?: string
  kind?: 'milestone' | 'date'
  sort?: number
  completedAt?: string | null
}

export interface DemandDownloadGroup {
  key: string
  title: string
  kind: 'milestone' | 'date'
  sort: number
  status: 'ready' | 'waiting' | 'not_due'
  count: number
  noteIds: string[]
  /** Milestone completion date, when completed. */
  completedAt: string | null
}

/** Issued notes are downloadable. A future milestone or date stays its own group and is not issued. */
export function groupDemandDownloads(rows: DemandGroupSource[]): DemandDownloadGroup[] {
  const groups = new Map<string, DemandDownloadGroup & { anyDue: boolean }>()
  for (const row of rows) {
    const title = row.trigger.trim() || 'Installment'
    const key = row.key || title.toLowerCase()
    const current = groups.get(key) || {
      key,
      title,
      kind: row.kind || 'milestone',
      sort: row.sort ?? 999,
      completedAt: row.completedAt ?? null,
      status: 'not_due' as const,
      count: 0,
      noteIds: [],
      anyDue: false,
    }
    current.count += 1
    if (row.noteId) current.noteIds.push(row.noteId)
    if (row.due) current.anyDue = true
    groups.set(key, current)
  }
  return [...groups.values()]
    .map(({ anyDue, ...group }) => ({
      ...group,
      status: (group.noteIds.length ? 'ready' : anyDue ? 'waiting' : 'not_due') as DemandDownloadGroup['status'],
    }))
    .sort((a, b) => (a.kind === b.kind ? a.sort - b.sort || a.key.localeCompare(b.key) : a.kind === 'milestone' ? -1 : 1))
}

type Row = Record<string, unknown>

/** Groups for the Downloads page and the ZIP route, from the same query. */
export async function loadDemandGroups(supabase: SupabaseClient, today: string): Promise<{ groups: DemandDownloadGroup[]; notes: Row[] }> {
  const [notes, rows, milestones, bookings] = await Promise.all([
    supabase.from('demand_notes').select('*'),
    supabase.from('booking_schedule_rows').select('id, booking_id, label, trigger_type, milestone_id, milestone_date'),
    supabase.from('construction_milestones').select('id, code, label, sort_order, completed_at'),
    supabase.from('bookings').select('id').in('status', ['SUBMITTED', 'EDITED']).is('deleted_at', null),
  ])
  const groups = groupDemandDownloads(
    demandSources({
      rows: rows.data || [],
      notes: notes.data || [],
      milestones: milestones.data || [],
      activeBookingIds: new Set(((bookings.data || []) as Row[]).map((row) => String(row.id))),
      today,
    })
  )
  return { groups, notes: notes.data || [] }
}

/**
 * One source per installment on an active booking: construction rows grouped by
 * milestone, dated rows grouped by their date.
 */
export function demandSources(input: {
  rows: Row[]
  notes: Row[]
  milestones: Row[]
  activeBookingIds: Set<string>
  today: string
}): DemandGroupSource[] {
  const noteByRow = new Map(input.notes.map((note) => [String(note.schedule_row_id), note]))
  const milestone = new Map(input.milestones.map((item) => [String(item.id), item]))
  return input.rows
    .filter((row) => input.activeBookingIds.has(String(row.booking_id)))
    .map((row) => {
      const note = noteByRow.get(String(row.id))
      if (row.trigger_type === 'date' && row.milestone_date) {
        const date = String(row.milestone_date).slice(0, 10)
        return {
          key: `date:${date}`,
          kind: 'date' as const,
          sort: Number(date.replace(/-/g, '')),
          trigger: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)),
          due: Boolean(note) || date <= input.today,
          noteId: (note?.id as string) || null,
        }
      }
      const stage = row.milestone_id ? milestone.get(String(row.milestone_id)) : undefined
      return {
        key: stage ? `milestone:${stage.code}` : String(note?.trigger_label || row.label || 'Installment').toLowerCase(),
        kind: 'milestone' as const,
        sort: stage ? Number(stage.sort_order) : 999,
        trigger: String(stage?.label || note?.trigger_label || row.label || 'Installment'),
        due: Boolean(note) || Boolean(stage?.completed_at),
        completedAt: (stage?.completed_at as string) || null,
        noteId: (note?.id as string) || null,
      }
    })
}
