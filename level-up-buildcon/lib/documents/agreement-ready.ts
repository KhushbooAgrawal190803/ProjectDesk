import { considerationOf } from '@/lib/booking/consideration'
import { percentOfPaise, toHundredths } from '@/lib/booking/money'
import { entryCountsAsReceived } from '@/lib/ledger/model'
import { boundaryMatch } from '@/lib/data/flat-boundaries'
import { getUndividedLandShare } from '@/lib/data/land-share'
import { getOwnerTypeForFlat } from '@/lib/data/flat-ownership'
import { matchMilestoneCode } from '@/lib/demands/milestones'
import { formatAmountFigures } from '@/lib/documents/inr-words'
import type { AgreementDocumentInput, AgreementParty } from '@/lib/documents/agreement'
import { isCheque, scheduleCLines, type AgreementFinance, type AgreementPayment, type FinanceScenario, type ScheduleSource } from '@/lib/documents/agreement-wording'

type Row = Record<string, unknown>

function text(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

/** Street lines first, "City, State-PIN" last, the way the master lays out an address. */
function addressLines(row: Row, prefix: string, wholeAddress: string): string[] {
  const part = (key: string) => text(row[`${prefix}${key}`])
  const street = [part('address_line1'), part('address_line2')].filter(Boolean)
  const state = [part('state'), part('pin_code')].filter(Boolean).join('-')
  const cityLine = [part('city'), state].filter(Boolean).join(', ')
  if (street.length || cityLine) return [...street, cityLine].filter(Boolean)
  return wholeAddress
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line.toLowerCase() !== 'india')
}

function areaFigure(value: unknown): string {
  const area = Number(value)
  return value != null && value !== '' && Number.isFinite(area) && area > 0 ? String(area) : ''
}

const SCENARIOS: FinanceScenario[] = ['purchaser', 'split_50_50', 'split_10_90']

/** Which approved Article I wording applies, and whether the loan is sanctioned yet. */
function financeOf(booking: Row): AgreementFinance {
  const stored = text(booking.finance_scenario) as FinanceScenario
  const status = text(booking.finance_loan_status).toLowerCase()
  const sanctionRecorded = Boolean(text(booking.finance_sanction_ref) || text(booking.finance_sanction_date))
  // Sanctioned, Partially Disbursed and Fully Disbursed loans are sanctioned; Proposed and Applied are not.
  const loanSanctioned = status
    ? status.startsWith('sanction') || status.includes('disbursed')
    : sanctionRecorded ? true : null
  return {
    scenario: SCENARIOS.includes(stored) ? stored : 'purchaser',
    bankName: text(booking.finance_bank_name),
    loanSanctioned,
  }
}

export function agreementReadiness(booking: Row, extras: {
  coapplicants?: Row[]
  payments?: Row[]
  schedule?: Row[]
}): { issues: string[]; warnings: string[]; input?: AgreementDocumentInput } {
  const issues: string[] = []
  const warnings: string[] = []
  const unit = text(booking.unit_no)
  const owner = getOwnerTypeForFlat(unit)
  if (owner === 'LANDOWNER') {
    issues.push('This flat is in the landowner allocation. A landowner agreement template has not been supplied, so a developer agreement will not be used.')
  } else if (!owner) {
    issues.push('The flat number is not a known Anandam unit.')
  }
  const executionDate = text(booking.agreement_for_sale_date).slice(0, 10)
  if (!executionDate) issues.push('Agreement for Sale date is not entered.')
  const applicant = text(booking.applicant_name)
  if (!applicant) issues.push('Applicant name is not entered.')
  const boundaries = boundaryMatch(unit)
  if (boundaries.state === 'missing') issues.push(`Flat ${unit} is not on the current boundary schedule. The old boundary list is not used.`)
  if (boundaries.state === 'ambiguous') issues.push(`Flat ${unit} matches more than one row on the boundary schedule.`)
  if (boundaries.state === 'empty') issues.push('Flat number is not entered.')
  const storedShare = toHundredths(booking.undivided_land_share)
  const lookedUp = getUndividedLandShare(text(booking.project_name) || 'Anandam', unit)
  const land = storedShare != null ? Number(storedShare) / 100 : lookedUp
  if (land == null) issues.push('Undivided land share is not on the schedule for this flat.')
  const priced = considerationOf(booking)
  const consideration = priced?.totalPaise ?? null
  if (consideration == null || consideration <= 0n) issues.push('Combined property price is missing.')
  const builtUp = areaFigure(booking.builtup_area)
  const superBuiltUp = areaFigure(booking.super_builtup_area)
  if (!builtUp || !superBuiltUp) issues.push('Built-up and super built-up areas are not entered.')
  const schedule = extras.schedule || []
  if (!schedule.length) issues.push('The payment schedule is empty.')
  if (issues.length || boundaries.state !== 'found' || consideration == null || land == null) return { issues, warnings }

  const parties: AgreementParty[] = [
    {
      salutation: text(booking.applicant_salutation),
      name: applicant,
      relationship: text(booking.applicant_relationship),
      relativeName: text(booking.applicant_father_or_spouse),
      occupation: text(booking.applicant_occupation),
      aadhaar: text(booking.applicant_aadhaar),
      pan: text(booking.applicant_pan),
      mobile: text(booking.applicant_mobile),
      addressLines: addressLines(booking, 'applicant_', text(booking.applicant_address)),
    },
    ...(extras.coapplicants || []).filter((person) => text(person.name)).map((person) => ({
      salutation: text(person.salutation),
      name: text(person.name),
      relationship: text(person.relationship),
      relativeName: text(person.father_or_spouse),
      occupation: text(person.occupation),
      aadhaar: text(person.aadhaar),
      pan: text(person.pan),
      mobile: text(person.mobile),
      addressLines: addressLines(person, '', text(person.address)),
    })),
  ]
  for (const party of parties) {
    const missing = [
      party.relationship ? '' : 'relationship',
      party.relativeName ? '' : "parent's or spouse's name",
      party.occupation ? '' : 'occupation',
      party.aadhaar ? '' : 'UID number',
      party.pan ? '' : 'PAN',
      party.mobile ? '' : 'mobile number',
      party.addressLines.length ? '' : 'address',
    ].filter(Boolean)
    if (missing.length) warnings.push(`${party.name}: ${missing.join(', ')} not entered. A blank line is left in the agreement.`)
  }

  const primaryName = `${parties[0].salutation || ''} ${applicant}`.trim()
  const entries = extras.payments || []
  const payerName = (payment: Row): string => {
    const named = text(payment.payer_name)
    if (named) return named
    if (payment.payer_kind === 'coapplicant') {
      const person = (extras.coapplicants || []).find((row) => row.id === payment.payer_coapplicant_id)
      if (person) return `${text(person.salutation)} ${text(person.name)}`.trim()
    }
    if (payment.payer_kind === 'bank') return text(booking.finance_bank_name)
    return primaryName
  }
  // Only money that has arrived is acknowledged. Expected bank money, cheques
  // awaiting clearance and returned payments are not receipts.
  if (entries.some((payment) => payment.status === 'pending_clearance')) {
    warnings.push('A booking payment is awaiting clearance. It is not acknowledged in Article I until it is cleared.')
  }
  const payments: AgreementPayment[] = entries.length
    ? entries
        .filter((payment) => entryCountsAsReceived(payment.status as string) && (toHundredths(payment.amount) ?? 0n) > 0n)
        .map((payment) => ({
          payer: payerName(payment),
          amountPaise: toHundredths(payment.amount) ?? 0n,
          mode: text(payment.payment_mode),
          modeDetail: text(payment.payment_mode_detail),
          reference: text(payment.reference_no),
          date: text(payment.payment_date),
          bank: text(payment.originating_bank),
        }))
    : (toHundredths(booking.booking_amount_paid) ?? 0n) > 0n
      ? [{
          payer: primaryName,
          amountPaise: toHundredths(booking.booking_amount_paid) ?? 0n,
          mode: text(booking.payment_mode),
          modeDetail: text(booking.payment_mode) === 'Other' ? text(booking.payment_mode_detail) : '',
          reference: text(booking.txn_or_cheque_no),
          date: text(booking.txn_date),
          // For a cheque, the payment details box on the booking holds the bank it is drawn on.
          bank: text(booking.payment_mode) === 'Cheque' ? text(booking.payment_mode_detail) : '',
        }]
      : []
  const bookingPaid = payments.reduce((sum, payment) => sum + payment.amountPaise, 0n)
  if (!payments.length) {
    warnings.push('No booking payment is recorded as received. The booking amount and the payment entry are left blank in Article I.')
  } else {
    if (payments.some((payment) => isCheque(payment) && !payment.bank)) {
      warnings.push('The bank a cheque is drawn on is not entered. A blank line is left after "The aforesaid cheque(s) are drawn on".')
    }
    if (payments.some((payment) => !(payment.reference || '').trim() && payment.mode !== 'Cash')) {
      warnings.push('A booking payment has no cheque or reference number. A blank line is left in its entry.')
    }
    if (payments.some((payment) => !(payment.date || '').trim())) {
      warnings.push('A booking payment has no date. A blank line is left in its entry.')
    }
  }

  const finance = financeOf(booking)
  if (finance.scenario !== 'purchaser') {
    if (!finance.bankName) warnings.push('The financing bank is not entered. A blank line is left for its name in Article I.')
    if (finance.loanSanctioned == null) {
      warnings.push('Loan status is not entered. Article I uses the wording for a sanctioned loan; choose Proposed or Applied on the booking if the loan is still to be sanctioned.')
    }
  }

  const sources: ScheduleSource[] = schedule.map((row) => ({
    code: row.trigger_type === 'date' ? null : text(row.milestone_code) || matchMilestoneCode(text(row.label)),
    label: text(row.label),
    date: row.trigger_type === 'date' ? text(row.milestone_date) : '',
    amountPaise: toHundredths(row.calculated_amount) ?? 0n,
  }))
  const scheduleC = scheduleCLines(sources, bookingPaid)
  if (bookingPaid > 0n && !scheduleC.bookingShown) {
    warnings.push('Schedule C has no separate "At the time of Booking" line, because the booking amount could not be taken out of an instalment due at execution of the agreement.')
  }
  const scheduleTotal = scheduleC.lines.reduce((sum, line) => sum + line.amountPaise, 0n)
  if (scheduleTotal !== consideration) {
    const parkingCharges = priced?.parkingPaise ?? 0n
    const cause = parkingCharges > 0n && consideration - scheduleTotal === parkingCharges
      ? ` The payment schedule on this booking does not include the parking charges of Rs.${formatAmountFigures(parkingCharges)}/-. It must be recalculated on Total Consideration. A signed agreement or issued demand note is not overwritten automatically.`
      : ' The stored schedule does not equal Total Consideration and needs authorized review.'
    warnings.push(`Schedule C adds up to Rs.${formatAmountFigures(scheduleTotal)}/-, and the Total Consideration is Rs.${formatAmountFigures(consideration)}/-.${cause}`)
  }

  const parkingCount = Number(booking.additional_parking || 0) + Number(booking.premium_parking || 0)
  if (parkingCount <= 0) warnings.push('No parking space is recorded on this booking. The parking count is left blank in the agreement.')
  const allotmentDate = text(booking.allotment_date).slice(0, 10)
  if (!allotmentDate) warnings.push('Allotment date is not entered. The allotment letter date is left blank.')

  const floor = text(booking.floor_no) || (unit.length >= 3 ? unit.slice(0, -2) : '')
  const input: AgreementDocumentInput = {
    executionDate,
    unitNo: unit,
    floorNo: floor,
    builtUp,
    superBuiltUp,
    landShare: String(land),
    allotmentDate,
    parkingCount,
    boundaries: boundaries.boundaries,
    considerationPaise: consideration,
    gstPaise: percentOfPaise(consideration, 5) ?? 0n,
    bookingPaidPaise: bookingPaid,
    parties,
    payments,
    finance,
    schedule: scheduleC.lines,
  }
  return { issues: [], warnings, input }
}
