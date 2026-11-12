import { getOwnerTypeForFlat, type OwnerType } from '@/lib/data/flat-ownership'
import { considerationOf } from '@/lib/booking/consideration'
import { percentOfPaise, toHundredths } from '@/lib/booking/money'
import { formatPersonName } from '@/lib/booking/person'
import { formatPostalAddress, type PostalAddressInput } from '@/lib/booking/address'
import { CONSIDERATION_GST_PERCENT, receivingAccountFor } from '@/lib/documents/receiving-accounts'
import { formatLetterDate, rsWithWords } from '@/lib/documents/inr-words'

export interface LetterPerson extends PostalAddressInput {
  salutation?: string | null
  name?: string | null
  address?: string | null
}

export interface LetterSource {
  unit_no?: string | null
  unit_type?: string | null
  project_name?: string | null
  project_location?: string | null
  project_address?: string | null
  applicant_name?: string | null
  applicant_salutation?: string | null
  applicant_father_or_spouse?: string | null
  applicant_address?: string | null
  applicant_address_line1?: string | null
  applicant_address_line2?: string | null
  applicant_city?: string | null
  applicant_state?: string | null
  applicant_pin_code?: string | null
  applicant_country?: string | null
  coapplicant_name?: string | null
  coapplicants?: LetterPerson[] | null
  basic_sale_price?: number | string | null
  total_cost?: number | string | null
  total_parking_charges?: number | string | null
  total_property_value?: number | string | null
  booking_amount_paid?: number | string | null
  gst_collected?: number | string | null
  boundary_east?: string | null
  boundary_west?: string | null
  boundary_north?: string | null
  boundary_south?: string | null
  allotment_date?: string | null
  agreement_for_sale_date?: string | null
  noc_required?: boolean | null
  noc_bank_name?: string | null
  noc_addressee?: string | null
  noc_bank_address?: string | null
}

export type LetterKind = 'allotment' | 'noc'

export type LetterBlock =
  | { kind: 'line'; text: string; bold?: boolean; center?: boolean; gapAfter?: number }
  | { kind: 'paragraph'; text: string; gapAfter?: number }
  | { kind: 'table'; rows: Array<{ label: string; value: string }> }
  | {
      kind: 'grid'
      boldLast?: boolean
      columns: Array<{ header: string; width: number; align?: 'left' | 'right' }>
      rows: string[][]
    }
  | { kind: 'signature'; style: 'allotment' | 'noc' | 'demand' }

export class LetterNotReadyError extends Error {
  issues: string[]
  constructor(issues: string[]) {
    super(issues[0] || 'This letter is not ready')
    this.name = 'LetterNotReadyError'
    this.issues = issues
  }
}

export interface LetterDocument {
  kind: LetterKind
  owner: OwnerType | null
  blocks: LetterBlock[]
  /** Missing facts. A letter is not generated while this list has entries. */
  issues: string[]
}

const LANDOWNER_SENTENCE =
  'This Allotment is being done from the share & on behalf of the Land owner M/s Balaji Projects and Hospitality Private Limited, 452-A, P.P. Compound, Hindpidi, Ranchi, Jharkhand.'

function clean(value?: string | null): string {
  return (value || '').trim()
}

function unitNoun(unitType?: string | null): string {
  if (unitType === 'Shop') return 'Shop'
  if (unitType === 'Office') return 'Office'
  if (unitType === 'Villa') return 'Villa'
  if (unitType === 'Plot') return 'Plot'
  return 'Flat'
}

function dearWord(salutation?: string | null): string {
  const value = clean(salutation).replace(/\./g, '').toLowerCase()
  if (value === 'mr') return 'Sir'
  if (value === 'mrs' || value === 'ms' || value === 'miss') return 'Madam'
  return 'Sir/Madam'
}

/** The person's own saved address: the formatted text, or else their own address lines. Never another person's. */
function ownAddress(address: string | null | undefined, lines: PostalAddressInput): string {
  if (clean(address)) return clean(address)
  if (!clean(lines.address_line1) && !clean(lines.city)) return ''
  return formatPostalAddress({ ...lines, country: clean(lines.country) || 'India' })
}

function peopleOf(source: LetterSource): LetterPerson[] {
  const people: LetterPerson[] = [
    {
      salutation: source.applicant_salutation,
      name: source.applicant_name,
      address: ownAddress(source.applicant_address, {
        address_line1: source.applicant_address_line1,
        address_line2: source.applicant_address_line2,
        city: source.applicant_city,
        state: source.applicant_state,
        pin_code: source.applicant_pin_code,
        country: source.applicant_country,
      }),
    },
  ]
  if (source.coapplicants?.length) {
    for (const person of source.coapplicants) {
      if (clean(person.name)) people.push({ ...person, address: ownAddress(person.address, person) })
    }
  } else if (clean(source.coapplicant_name)) {
    people.push({ name: source.coapplicant_name })
  }
  return people.filter((person) => clean(person.name))
}

function displayNames(people: LetterPerson[]): string {
  return people.map((person) => formatPersonName(person.salutation, person.name)).join(' & ')
}

/** "A", "A and B", "A, B and C", in the order entered. */
export function listNames(people: LetterPerson[]): string {
  const names = people.map((person) => formatPersonName(person.salutation, person.name))
  if (names.length <= 1) return names[0] || ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Wording that changes with the number of purchasers. */
export function purchaserGrammar(count: number) {
  const plural = count > 1
  return {
    plural,
    referredAs: plural ? 'the Purchasers' : 'the Purchaser',
    hasBeen: plural ? 'have been' : 'has been',
    noun: plural ? 'purchasers' : 'purchaser',
    label: plural ? 'Purchasers' : 'Purchaser',
    theirOwn: plural ? 'their own' : 'the purchaser\'s own',
    them: plural ? 'them' : 'the purchaser',
    allottee: plural ? 'Purchasers/Allottees' : 'Purchaser/Allottee',
  }
}

function considerationPaise(source: LetterSource): bigint | null {
  return considerationOf(source)?.totalPaise ?? toHundredths(source.total_property_value)
}

function paidSentence(paid: bigint, collected: bigint): string {
  if (collected > 0n) {
    return `You have paid ${rsWithWords(paid)} & GST amount ${rsWithWords(collected)} as advance against the allotted flat.`
  }
  return `You have paid ${rsWithWords(paid)} as advance against the allotted flat.`
}

function addressLines(person: LetterPerson, parents?: string | null): string[] {
  const lines: string[] = []
  if (clean(parents)) lines.push(`C/o ${clean(parents)}`)
  for (const line of clean(person.address).split('\n')) {
    if (line.trim()) lines.push(line.trim())
  }
  return lines
}

export function buildLetter(source: LetterSource, kind: LetterKind): LetterDocument {
  const issues: string[] = []
  const unit = clean(source.unit_no)
  const noun = unitNoun(source.unit_type)
  const owner = unit ? getOwnerTypeForFlat(unit) : null
  const people = peopleOf(source)
  const names = displayNames(people)
  const project = clean(source.project_name)
  const allotmentDate = formatLetterDate(source.allotment_date)
  const agreementDate = formatLetterDate(source.agreement_for_sale_date)
  const consideration = considerationPaise(source)
  const gst = consideration == null ? null : percentOfPaise(consideration, CONSIDERATION_GST_PERCENT)
  const paid = toHundredths(source.booking_amount_paid ?? 0) ?? 0n
  const collected = toHundredths(source.gst_collected ?? 0) ?? 0n
  const loanBank = clean(source.noc_bank_name)

  if (!unit) issues.push('Unit number is missing.')
  if (!owner) issues.push('This unit is not on the developer or landowner allocation list, so the letter variant cannot be chosen.')
  if (!people.length) issues.push('Applicant name is missing.')
  if (kind === 'allotment') {
    for (const person of people) {
      if (!clean(person.address)) {
        issues.push(`Address is not recorded for ${formatPersonName(person.salutation, person.name)}. Another applicant's address will not be used in its place.`)
      }
    }
  }
  if (!project) issues.push('Project name is missing.')
  if (!allotmentDate) issues.push('Allotment date is not entered. The letter will not use today\'s date in its place.')
  if (consideration == null || consideration <= 0n) issues.push('Combined property price (flat base plus parking) is missing.')
  if (paid < 0n) issues.push('Booking amount paid cannot be negative.')
  if (collected < 0n) issues.push('GST collected cannot be negative.')

  const boundaries: Array<[string, string]> = [
    ['East', clean(source.boundary_east)],
    ['West', clean(source.boundary_west)],
    ['North', clean(source.boundary_north)],
    ['South', clean(source.boundary_south)],
  ]
  const missingBoundaries = boundaries.filter(([, value]) => !value).map(([side]) => side)
  if (missingBoundaries.length) {
    issues.push(`Boundary not recorded: ${missingBoundaries.join(', ')}. The letter will not invent one.`)
  }

  if (kind === 'noc') {
    if (!source.noc_required) issues.push('Bank NOC was not requested for this booking.')
    if (!agreementDate) issues.push('Agreement for Sale date is not entered. It is kept separate from the allotment date and will not be invented.')
    if (!loanBank) issues.push('Loan bank name is missing.')
    if (!clean(source.noc_addressee)) issues.push('Bank addressee is missing.')
    if (!clean(source.noc_bank_address)) issues.push('Loan bank address is missing.')
    if (!clean(source.project_address)) issues.push('Plot details are not recorded on the project.')
    if (!clean(source.project_location)) issues.push('Project location is missing.')
  }

  const blocks: LetterBlock[] = []
  if (issues.length || !owner || consideration == null || gst == null || !allotmentDate) {
    return { kind, owner, blocks, issues }
  }

  const unitLabel = `${noun} No. ${unit}`
  if (kind === 'allotment') {
    blocks.push({ kind: 'line', text: `Dated: ${allotmentDate}`, gapAfter: 16 })
    people.forEach((person, index) => {
      blocks.push({ kind: 'line', text: formatPersonName(person.salutation, person.name), bold: true, gapAfter: 2 })
      const parents = index === 0 ? source.applicant_father_or_spouse : null
      const lines = addressLines(person, parents)
      lines.forEach((line, lineIndex) => {
        blocks.push({ kind: 'line', text: line, gapAfter: lineIndex === lines.length - 1 ? 12 : 1 })
      })
    })
    blocks.push({
      kind: 'line',
      text: `Subject: Confirmation of Allotment of ${unitLabel} :- ${names}`,
      bold: true,
      gapAfter: 14,
    })
    const greetings = new Set(people.map((person) => dearWord(person.salutation)))
    const greeting = greetings.size === 1 ? [...greetings][0] : 'Sir/Madam'
    blocks.push({ kind: 'line', text: `Dear ${greeting},`, gapAfter: 12 })

    const allotted = `We are pleased to inform you that you have been allotted ${unitLabel} in our Resi-Commercial project, "${project}".`
    blocks.push({
      kind: 'paragraph',
      text: owner === 'LANDOWNER' ? `${allotted} ${LANDOWNER_SENTENCE}` : allotted,
    })
    const costLead = owner === 'LANDOWNER' ? `The total cost of the ${unitLabel}` : `The total cost of the ${noun.toLowerCase()}`
    blocks.push({
      kind: 'paragraph',
      text: `${costLead} is ${rsWithWords(consideration)}, and GST amounts to ${rsWithWords(gst)}. All taxes & duties are subject to statutory variation & will be charged as per actual.`,
    })
    blocks.push({ kind: 'paragraph', text: paidSentence(paid, collected) })
    blocks.push({
      kind: 'paragraph',
      text: 'This allotment is subject to the terms and conditions of the agreement for sale and shall remain valid unless cancelled or terminated in accordance with the provisions thereof.',
      gapAfter: 14,
    })
    blocks.push({ kind: 'line', text: `Boundaries of the ${noun}:`, gapAfter: 4 })
    for (const [side, value] of boundaries) {
      blocks.push({ kind: 'line', text: `${side}: ${value}`, gapAfter: 2 })
    }
    blocks.push({ kind: 'signature', style: 'allotment' })
    return { kind, owner, blocks, issues }
  }

  const city = clean(source.project_location).split(',')[0].trim()
  const account = receivingAccountFor(owner)
  const grammar = purchaserGrammar(people.length)
  const certified = listNames(people)
  blocks.push({ kind: 'line', text: 'No Objection Certificate (NOC)', bold: true, center: true, gapAfter: 12 })
  blocks.push({ kind: 'line', text: `Dated: ${allotmentDate}`, gapAfter: 12 })
  blocks.push({ kind: 'line', text: 'To,', gapAfter: 1 })
  blocks.push({ kind: 'line', text: clean(source.noc_addressee), gapAfter: 1 })
  blocks.push({ kind: 'line', text: `${loanBank}.`, gapAfter: 1 })
  const bankLines = clean(source.noc_bank_address).split('\n').map((line) => line.trim()).filter(Boolean)
  bankLines.forEach((line, index) => {
    blocks.push({ kind: 'line', text: line, gapAfter: index === bankLines.length - 1 ? 12 : 1 })
  })
  blocks.push({ kind: 'line', text: 'Dear Sir/Madam,', gapAfter: 12 })
  blocks.push({
    kind: 'line',
    text: `Subject: Confirmation of Allotment of ${unitLabel}:- ${names}`,
    bold: true,
    gapAfter: 12,
  })
  blocks.push({
    kind: 'paragraph',
    text: `This is to certify that ${certified}, hereinafter referred to as ${grammar.referredAs}, ${grammar.hasBeen} allotted the ${unitLabel}. We further confirm that M/s LEVEL UP BUILDCON is the developer and is duly entitled and authorised to allot, transfer and convey the ${noun.toLowerCase()} described below in favour of ${certified} subject to the terms and conditions of the agreement for sale dated ${agreementDate} and applicable laws.`,
  })
  blocks.push({
    kind: 'table',
    rows: [
      { label: 'Developer', value: 'M/s LEVEL UP BUILDCON' },
      { label: 'Project', value: project },
      { label: noun === 'Flat' ? 'Flat No.' : `${noun} No.`, value: unit },
      { label: grammar.label, value: certified },
      { label: 'City', value: city },
      { label: 'Plot Details', value: clean(source.project_address) },
      { label: 'Location', value: clean(source.project_location) },
    ],
  })
  blocks.push({
    kind: 'paragraph',
    text: `2. The total consideration for this transaction is ${rsWithWords(consideration)}, and GST amounts to ${rsWithWords(gst)}. All taxes & duties are subject to statutory variation and will be charged as per actual.`,
  })
  blocks.push({
    kind: 'paragraph',
    text: '3. The title of the property described above is clear, marketable and free from all encumbrances, claims, liens and third-party rights.',
  })
  blocks.push({
    kind: 'paragraph',
    text: `4. We confirm that We have no Objection whatsoever to the ${grammar.noun}, at ${grammar.theirOwn} costs, charges, risks and consequences creating an equitable mortgage over the said ${noun.toLowerCase()} to ${loanBank} (herein after referred to as "the Bank") as security for the amount advanced by the bank to ${grammar.them} subject to the fulfilment of all the terms and conditions of the agreement for sale document by the said ${grammar.noun}.`,
  })
  blocks.push({
    kind: 'paragraph',
    text: `5. We have not borrowed from any financial institution for the purchase/development of the property and have not created and will not create any encumbrances on the property allotted to the said ${grammar.noun} during the currency of the loan sanctioned/to be sanctioned by the bank to ${grammar.them}, subject to the fulfilment of all the terms and conditions of the agreement for sale document by the said ${grammar.noun}.`,
  })
  blocks.push({
    kind: 'paragraph',
    text: `6. Upon creation of proper charge/mortgage in favour of ${loanBank} and upon receipt of the relevant intimation and supporting documents from the ${grammar.noun} and/or the Bank, we undertake to record the Bank's charge/mortgage in our records, wherever applicable, and acknowledge the interest of the Bank in aforesaid Flat. We further undertake not to transfer, assign, or otherwise deal with the said ${noun.toLowerCase()} in any manner inconsistent with the rights of the Bank without obtaining the prior written consent/NOC of the Bank, subject to the terms and conditions of the Agreement for Sale and applicable laws.`,
  })
  blocks.push({
    kind: 'paragraph',
    text: `7. After creation of charge/mortgage and after receipt of the copies thereof and after receipt of the proper nomination in favour of the bank from the above-named ${grammar.noun}, we undertake to inform the society about the Bank\'s charge on the said flat as and when the society of Apartment owners is formed.`,
  })
  blocks.push({
    kind: 'paragraph',
    text: '8. Please note that the payment for this transaction should be made by crossed cheque/Transfer of funds favouring:',
    gapAfter: 8,
  })
  for (const line of [
    `Account Name: ${account.accountName}`,
    `Account No: ${account.accountNumber}`,
    `Bank Name: ${account.bank}`,
    `Branch: ${account.branch}`,
    `IFSC Code: ${account.ifsc}`,
  ]) {
    blocks.push({ kind: 'line', text: line, gapAfter: line.startsWith('IFSC') ? 12 : 2 })
  }
  blocks.push({
    kind: 'paragraph',
    text: '9. We undertake that any change in the Escrow Account of the Project shall be intimated to the Purchaser(s) and the Bank through Registered Post with Acknowledgement Due (RPAD) before such change becomes effective.',
    gapAfter: 10,
  })
  blocks.push({
    kind: 'paragraph',
    text: `10. This NOC-cum-Confirmation is being issued at the request of the ${grammar.allottee} for the submission to the Bank for the purpose of sanctioning and disbursing the Housing Loan/Home Loan against the aforesaid Flat.`,
  })
  blocks.push({
    kind: 'paragraph',
    text: 'The NOC shall not by itself constitute a transfer or conveyance of the said Flat, and the rights and obligations of the parties shall be governed by the Agreement for Sale and applicable laws.',
    gapAfter: 16,
  })
  blocks.push({ kind: 'signature', style: 'noc' })
  return { kind, owner, blocks, issues }
}

export function letterPlainText(document: LetterDocument): string {
  return document.blocks
    .map((block) => {
      if (block.kind === 'line' || block.kind === 'paragraph') return block.text
      if (block.kind === 'table') return block.rows.map((row) => `${row.label} ${row.value}`).join('\n')
      if (block.kind === 'grid') return block.rows.map((row) => row.join(' ')).join('\n')
      if (block.style === 'noc') return 'Yours Faithfully, For LEVEL UP BUILDCON Partner'
      if (block.style === 'demand') return 'Thanking you, For LEVEL UP BUILDCON Partner'
      return 'Thanking you, Warm Regards, For LEVEL UP BUILDCON Partner'
    })
    .join('\n')
}
