export function formatPersonName(salutation?: string | null, name?: string | null): string {
  return [salutation?.trim(), name?.trim()].filter(Boolean).join(' ')
}
