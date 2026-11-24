/**
 * Who the main applicant is. Most bookings are by an individual; an HUF, company,
 * firm, trust or society books through a person who signs for it (the representative).
 * Any other kind is stored as typed.
 */
export const APPLICANT_TYPES = ['Individual', 'HUF', 'Company', 'Partnership Firm', 'Trust / Society'] as const

const KNOWN: Record<string, { description: string; designation: string; nameLabel: string }> = {
  HUF: { description: 'a Hindu Undivided Family', designation: 'Karta', nameLabel: 'Name of the HUF' },
  Company: { description: 'a company incorporated under the Companies Act', designation: 'Authorised Signatory', nameLabel: 'Company name' },
  'Partnership Firm': { description: 'a partnership firm', designation: 'Partner', nameLabel: 'Firm name' },
  'Trust / Society': { description: 'a trust / society', designation: 'Authorised Signatory', nameLabel: 'Name of the trust / society' },
}

export function isIndividual(type: string | null | undefined): boolean {
  const value = (type || '').trim()
  return !value || value === 'Individual'
}

export function isPresetApplicantType(type: string | null | undefined): boolean {
  return (APPLICANT_TYPES as readonly string[]).includes((type || '').trim())
}

/** The usual title of the person who signs, e.g. Karta for an HUF. */
export function defaultDesignation(type: string | null | undefined): string {
  return KNOWN[(type || '').trim()]?.designation || 'Authorised Signatory'
}

export function entityNameLabel(type: string | null | undefined): string {
  return KNOWN[(type || '').trim()]?.nameLabel || 'Name of the applicant entity'
}

/** "a Hindu Undivided Family", or "a society" for a typed-in kind. */
export function entityDescription(type: string | null | undefined): string {
  const value = (type || '').trim()
  if (KNOWN[value]) return KNOWN[value].description
  const lower = value.toLowerCase()
  return lower ? `${/^[aeiou]/.test(lower) ? 'an' : 'a'} ${lower}` : 'an entity'
}

/** "Karta: Mr. Ramesh Sharma", for forms that list the representative. */
export function representativeLine(designation: string | null | undefined, name: string | null | undefined): string {
  const who = (name || '').trim()
  if (!who) return ''
  const role = (designation || '').trim()
  return role ? `${role}: ${who}` : who
}

/** "through its Karta Mr. Ramesh Sharma", for letters and notes addressed to an entity. */
export function throughRepresentative(designation: string | null | undefined, name: string | null | undefined): string {
  const who = (name || '').trim()
  if (!who) return ''
  const role = (designation || '').trim() || 'Authorised Signatory'
  return `through its ${role} ${who}`
}

/** Columns added by migration 014. */
export const APPLICANT_TYPE_COLUMNS = ['applicant_type', 'applicant_representative', 'applicant_representative_designation'] as const
