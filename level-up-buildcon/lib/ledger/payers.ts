import type { PayerOption } from '@/components/payments/payment-form-fields'
import type { ExpectedOption, PayableInstallment } from '@/components/payments/record-payment-dialog'
import { hundredthsToString } from '@/lib/booking/money'
import { formatPersonName } from '@/lib/booking/person'
import type { BookingLedger } from './load'

type Row = Record<string, unknown>

/** Who can pay on this booking: the applicants, the financing bank when there is one, or someone else. */
export function payersFor(booking: Row, coapplicants: Row[]): PayerOption[] {
  const primary = formatPersonName(booking.applicant_salutation as string, booking.applicant_name as string) || 'Primary applicant'
  const financed = String(booking.finance_scenario || 'purchaser') !== 'purchaser'
  const bank = String(booking.finance_bank_name || '')
  return [
    { key: 'applicant', label: `${primary} (primary applicant)`, kind: 'applicant', name: primary },
    ...coapplicants.map((person) => {
      const name = formatPersonName(person.salutation as string, person.name as string) || 'Co-applicant'
      return { key: `coapplicant:${person.id}`, label: `${name} (co-applicant)`, kind: 'coapplicant' as const, coapplicantId: String(person.id), name }
    }),
    ...(financed || bank ? [{ key: 'bank', label: bank ? `${bank} (financing bank)` : 'Financing bank', kind: 'bank' as const, name: bank }] : []),
    { key: 'other', label: 'Someone else', kind: 'other' as const, name: '' },
  ]
}

export function payableFor(ledger: BookingLedger): PayableInstallment[] {
  return ledger.state.installments.map((row, index) => ({
    id: row.id,
    label: `${index + 1}. ${row.label}`,
    due: row.due,
    outstandingPrincipal: hundredthsToString(row.outstandingPrincipalPaise),
    outstandingGst: hundredthsToString(row.outstandingGstPaise),
  }))
}

export function expectedFor(ledger: BookingLedger): ExpectedOption[] {
  return ledger.expected
    .filter((item) => item.amountPaise > item.fulfilledPaise)
    .map((item) => ({ id: item.id, label: item.bankName || item.payerName || 'Bank', remaining: hundredthsToString(item.amountPaise - item.fulfilledPaise) }))
}
