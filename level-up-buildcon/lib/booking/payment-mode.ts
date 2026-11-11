export function formatPaymentMode(mode?: string | null, detail?: string | null): string {
  if (!mode) return ''
  if (mode === 'Other') {
    const specified = (detail || '').trim()
    return specified ? `Other (${specified})` : 'Other'
  }
  if (mode === 'NEFT_RTGS') return 'NEFT / RTGS'
  return mode.replaceAll('_', ' / ')
}
