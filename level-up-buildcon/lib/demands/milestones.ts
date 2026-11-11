/**
 * Project construction stages. A booking installment links to one of these
 * codes. Completion is stored per project, not per flat.
 */
export const CONSTRUCTION_MILESTONES = [
  { code: 'AGREEMENT', label: 'At the time of execution of the Agreement', match: 'execution of the Agreement', sort: 1 },
  { code: 'BASEMENT', label: 'Before casting of Basement slab', match: 'Basement slab', sort: 2 },
  { code: 'GROUND', label: 'Before casting of Ground slab', match: 'Ground slab', sort: 3 },
  { code: 'FLOOR_1', label: 'Before casting of 1st floor slab', match: '1st floor slab', sort: 4 },
  { code: 'FLOOR_2', label: 'Before casting of 2nd floor slab', match: '2nd floor slab', sort: 5 },
  { code: 'FLOOR_3', label: 'Before casting of 3rd floor slab', match: '3rd floor slab', sort: 6 },
  { code: 'FLOOR_4', label: 'Before casting of 4th floor slab', match: '4th floor slab', sort: 7 },
  { code: 'FLOOR_5', label: 'Before casting of 5th floor slab', match: '5th floor slab', sort: 8 },
  { code: 'FLOOR_6', label: 'Before casting of 6th floor slab', match: '6th floor slab', sort: 9 },
  { code: 'FLOOR_7', label: 'Before casting of 7th floor slab', match: '7th floor slab', sort: 10 },
  { code: 'FLOOR_8', label: 'Before casting of 8th floor slab', match: '8th floor slab', sort: 11 },
  { code: 'FLOOR_9', label: 'Before casting of 9th floor slab', match: '9th floor slab', sort: 12 },
  { code: 'FLOOR_10', label: 'Before casting of 10th floor slab', match: '10th floor slab', sort: 13 },
  { code: 'HANDOVER', label: 'At the time of Handover/ Registry of flat', match: 'Handover/ Registry', sort: 14 },
] as const

export type MilestoneCode = (typeof CONSTRUCTION_MILESTONES)[number]['code']

export const SEEDED_PROJECT_NAME = 'Anandam'

export function milestoneByCode(code: string | null | undefined) {
  return CONSTRUCTION_MILESTONES.find((item) => item.code === code) || null
}

/** One stable code per label. "1st floor" must not match "10th floor". */
export function matchMilestoneCode(label: string | null | undefined): MilestoneCode | null {
  const text = (label || '').toLowerCase()
  if (!text) return null
  const hits = CONSTRUCTION_MILESTONES.filter((item) => text.includes(item.match.toLowerCase()))
  return hits.length === 1 ? hits[0].code : null
}
