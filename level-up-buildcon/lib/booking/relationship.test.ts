import { describe, expect, it } from 'vitest'
import { isPresetRelationship, relativeWithRelation } from './relationship'

describe('relationship', () => {
  it('recognises the four presets and treats anything else as Other', () => {
    expect(isPresetRelationship('Father')).toBe(true)
    expect(isPresetRelationship('Guardian')).toBe(false)
  })
  it('prints the relative with the relation for the booking form', () => {
    expect(relativeWithRelation('Ramesh Kumar', 'Father')).toBe('Ramesh Kumar (Father)')
    expect(relativeWithRelation('Ramesh Kumar', ' guardian ')).toBe('Ramesh Kumar (Guardian)')
    expect(relativeWithRelation('Ramesh Kumar', '')).toBe('Ramesh Kumar')
    expect(relativeWithRelation('', 'Father')).toBe('')
  })
})
