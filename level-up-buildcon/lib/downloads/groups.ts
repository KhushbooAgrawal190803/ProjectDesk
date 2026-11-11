export interface DemandGroupSource {
  id?: string
  trigger: string
  due: boolean
  noteId?: string | null
}

export interface DemandDownloadGroup {
  key: string
  title: string
  status: 'ready' | 'waiting' | 'not_due'
  count: number
  noteIds: string[]
}

/** Issued notes are downloadable. A future milestone or date stays its own group and is not issued. */
export function groupDemandDownloads(rows: DemandGroupSource[]): DemandDownloadGroup[] {
  const groups = new Map<string, DemandDownloadGroup & { anyDue: boolean }>()
  for (const row of rows) {
    const title = row.trigger.trim() || 'Installment'
    const key = title.toLowerCase()
    const current = groups.get(key) || { key, title, status: 'not_due' as const, count: 0, noteIds: [], anyDue: false }
    current.count += 1
    if (row.noteId) current.noteIds.push(row.noteId)
    if (row.due) current.anyDue = true
    groups.set(key, current)
  }
  return [...groups.values()].map(({ anyDue, ...group }) => ({
    ...group,
    status: group.noteIds.length ? 'ready' : anyDue ? 'waiting' : 'not_due',
  }))
}
