export interface PostalAddressInput {
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  pin_code?: string | null
  country?: string | null
}

/**
 * Postal lines with no blank lines and no comma before a missing part.
 * City and state share one line; the PIN follows them with a space.
 */
export function formatPostalAddress(input: PostalAddressInput): string {
  const line1 = input.address_line1?.trim() || ''
  const line2 = input.address_line2?.trim() || ''
  const city = input.city?.trim() || ''
  const state = input.state?.trim() || ''
  const pin = input.pin_code?.trim() || ''
  const country = input.country?.trim() || ''

  const cityState = [city, state].filter(Boolean).join(', ')
  const locality = [cityState, pin].filter(Boolean).join(' ')

  return [line1, line2, locality, country].filter(Boolean).join('\n')
}
