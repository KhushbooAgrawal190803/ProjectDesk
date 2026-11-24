/**
 * How the person named as "Parents' / Spouse's Name" is related to the applicant.
 * The four presets cover most bookings. Anything else is stored as typed (for
 * example "Guardian" or "Grandfather"), always describing the named person's role.
 */
export const PRESET_RELATIONSHIPS = ['Father', 'Mother', 'Husband', 'Wife'] as const

export function isPresetRelationship(value: string | null | undefined): boolean {
  return (PRESET_RELATIONSHIPS as readonly string[]).includes((value || '').trim())
}

/** Tidies a typed relation: trims it and capitalises the first letter. */
export function normalizeRelationship(value: string | null | undefined): string {
  const text = (value || '').trim().replace(/\s+/g, ' ')
  return text ? text[0].toUpperCase() + text.slice(1) : ''
}

/** "Ramesh Kumar (Father)" for forms that print the relative's name with the relation. */
export function relativeWithRelation(name: string | null | undefined, relationship: string | null | undefined): string {
  const who = (name || '').trim()
  const rel = normalizeRelationship(relationship)
  if (!who) return ''
  return rel ? `${who} (${rel})` : who
}
