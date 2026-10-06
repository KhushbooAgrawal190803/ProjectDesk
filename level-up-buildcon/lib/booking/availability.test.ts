import { describe, expect, it } from 'vitest'
import {
  AVAILABILITY_CHECK_FAILED_MESSAGE,
  checkUnitAvailability,
  isUnitConflictError,
} from './availability'

function mockSupabase(result: { data: unknown; error: unknown }) {
  const chain = {
    eq: () => chain,
    in: () => chain,
    is: () => Promise.resolve(result),
    neq: () => Promise.resolve(result),
  }
  return {
    from: () => ({
      select: () => chain,
    }),
  } as unknown as Parameters<typeof checkUnitAvailability>[0]
}

describe('isUnitConflictError', () => {
  it('detects postgres unique violation', () => {
    expect(isUnitConflictError({ code: '23505' })).toBe(true)
  })
})

describe('checkUnitAvailability', () => {
  it('fail closed on query error', async () => {
    const supabase = mockSupabase({ data: null, error: { message: 'db down' } })
    const result = await checkUnitAvailability(supabase, 'Anandam', '101')
    expect(result).toEqual({ error: AVAILABILITY_CHECK_FAILED_MESSAGE })
  })

  it('returns unavailable when unit is held', async () => {
    const supabase = mockSupabase({
      data: [{ serial_display: 'LUBC 01', applicant_name: 'Test' }],
      error: null,
    })
    const result = await checkUnitAvailability(supabase, 'Anandam', '101')
    expect(result).toMatchObject({ available: false })
  })

  it('returns available when no conflict', async () => {
    const supabase = mockSupabase({ data: [], error: null })
    const result = await checkUnitAvailability(supabase, 'Anandam', '101')
    expect(result).toEqual({ available: true })
  })
})
