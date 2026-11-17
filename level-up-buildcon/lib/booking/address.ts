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
 * City and state share one line; a dash comes before the PIN.
 */
export function formatPostalAddress(input: PostalAddressInput): string {
  const line1 = input.address_line1?.trim() || ''
  const line2 = input.address_line2?.trim() || ''
  const city = input.city?.trim() || ''
  const state = input.state?.trim() || ''
  const pin = input.pin_code?.trim() || ''
  const country = input.country?.trim() || ''

  const cityState = [city, state].filter(Boolean).join(', ')
  const locality = cityState && pin ? `${cityState} - ${pin}` : cityState || pin

  return [line1, line2, locality, country].filter(Boolean).join('\n')
}
