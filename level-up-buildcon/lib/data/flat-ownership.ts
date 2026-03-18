export type OwnerType = 'DEVELOPER' | 'LANDOWNER'

export const OWNER_NAMES: Record<OwnerType, string> = {
  DEVELOPER: 'Level Up Buildcon',
  LANDOWNER: 'Balaji Hospitality',
}

// Flats owned by the Land Owner (Balaji Hospitality). All other known flats default to Developer.
const LANDOWNER_FLATS = new Set<string>([
  // 2nd floor
  '207',
  // 3rd floor
  '301', '302', '303', '308',
  // 4th floor
  '404', '408',
  // 5th floor
  '502',
  // 6th floor
  '602', '603',
  // 7th floor
  '702', '704', '708',
  // 8th floor
  '801', '802', '803', '804', '806',
  // 9th floor
  '902', '906', '908',
  // 10th floor
  '1001', '1002', '1003', '1004', '1006', '1007', '1008',
])

export function getOwnerTypeForFlat(unitNo?: string | null): OwnerType | null {
  if (!unitNo) return null
  const u = String(unitNo).trim()
  if (!/^\d{3,4}$/.test(u)) return null
  return LANDOWNER_FLATS.has(u) ? 'LANDOWNER' : 'DEVELOPER'
}

export function getOwnerNameForFlat(unitNo?: string | null): string | null {
  const t = getOwnerTypeForFlat(unitNo)
  return t ? OWNER_NAMES[t] : null
}

