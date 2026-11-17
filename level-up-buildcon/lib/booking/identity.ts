/** PAN is stored in capitals. Anything other than a letter or digit is dropped. */
export function normalizePan(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
}

/** Aadhaar is digits only, at most twelve. */
export function normalizeAadhaar(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '').slice(0, 12)
}
