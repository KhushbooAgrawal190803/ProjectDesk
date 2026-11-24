import { describe, expect, it } from 'vitest'
import { defaultDesignation, entityDescription, isIndividual, representativeLine, throughRepresentative } from './applicant-type'
import { careOfLine } from '@/lib/documents/letter-model'

describe('applicant type', () => {
  it('treats a missing type as an individual, so older bookings are unchanged', () => {
    expect(isIndividual(undefined)).toBe(true)
    expect(isIndividual('')).toBe(true)
    expect(isIndividual('Individual')).toBe(true)
    expect(isIndividual('HUF')).toBe(false)
    expect(isIndividual('Society')).toBe(false)
  })
  it('suggests the usual signatory and describes the entity', () => {
    expect(defaultDesignation('HUF')).toBe('Karta')
    expect(defaultDesignation('Partnership Firm')).toBe('Partner')
    expect(defaultDesignation('LLP')).toBe('Authorised Signatory')
    expect(entityDescription('HUF')).toBe('a Hindu Undivided Family')
    expect(entityDescription('Association of Persons')).toBe('an association of persons')
  })
  it('writes the representative for forms and letters', () => {
    expect(representativeLine('Karta', 'Mr. Ramesh Sharma')).toBe('Karta: Mr. Ramesh Sharma')
    expect(throughRepresentative('', 'Mr. Ramesh Sharma')).toBe('through its Authorised Signatory Mr. Ramesh Sharma')
    expect(careOfLine({ applicant_type: 'HUF', applicant_representative: 'Mr. Ramesh Sharma', applicant_representative_designation: 'Karta' })).toBe('Through its Karta Mr. Ramesh Sharma')
    expect(careOfLine({ applicant_type: null, applicant_father_or_spouse: 'Mr. Suresh Kapoor' })).toBe('C/o Mr. Suresh Kapoor')
  })
})
