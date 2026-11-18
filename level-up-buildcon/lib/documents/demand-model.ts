import type { OwnerType } from '@/lib/data/flat-ownership'
import { hundredthsToString, toHundredths } from '@/lib/booking/money'
import type { LetterBlock } from '@/lib/documents/letter-model'
import { formatLetterDate, formatRs, rsWithWords } from '@/lib/documents/inr-words'
import { RECEIVING_ACCOUNTS, type ReceivingAccount } from '@/lib/documents/receiving-accounts'
import { paymentDayPhrase } from '@/lib/demands/engine'

export interface DemandFigures {
  propertyValuePaise: bigint
  installmentPaise: bigint
  gstPaise: bigint
  principalReceivedPaise: bigint
  gstReceivedPaise: bigint
  principalOutstandingPaise: bigint
  gstOutstandingPaise: bigint
}

/** Unpaid balance of a demand note already issued for this booking. */
export interface PriorDemandBalance {
  referenceNumber: string
  issueDate: string
  principalOutstandingPaise: bigint
  gstOutstandingPaise: bigint
}

export interface DemandSnapshot extends DemandFigures {
  referenceNumber: string
  issueDate: string
  paymentDeadline: string
  paymentDays: number
  agreementDate: string
  owner: OwnerType
  unitNo: string
  projectName: string
  applicantLines: string[]
  milestoneLabel: string
  account: ReceivingAccount
  /** Earlier demand notes that still had money unpaid when this note was issued. */
  priorBalances?: PriorDemandBalance[]
}

function money(value: bigint): string {
  return hundredthsToString(value)
}

export function snapshotForStorage(snapshot: DemandSnapshot): Record<string, unknown> {
  return {
    ...snapshot,
    propertyValuePaise: money(snapshot.propertyValuePaise),
    installmentPaise: money(snapshot.installmentPaise),
    gstPaise: money(snapshot.gstPaise),
    principalReceivedPaise: money(snapshot.principalReceivedPaise),
    gstReceivedPaise: money(snapshot.gstReceivedPaise),
    principalOutstandingPaise: money(snapshot.principalOutstandingPaise),
    gstOutstandingPaise: money(snapshot.gstOutstandingPaise),
    priorBalances: (snapshot.priorBalances || []).map((item) => ({
      referenceNumber: item.referenceNumber,
      issueDate: item.issueDate,
      principalOutstandingPaise: money(item.principalOutstandingPaise),
      gstOutstandingPaise: money(item.gstOutstandingPaise),
    })),
  }
}

export function snapshotFromStorage(value: Record<string, unknown>): DemandSnapshot {
  const paise = (key: string) => toHundredths(value[key]) ?? 0n
  return {
    referenceNumber: String(value.referenceNumber || ''),
    issueDate: String(value.issueDate || ''),
    paymentDeadline: String(value.paymentDeadline || ''),
    paymentDays: Number(value.paymentDays || 7),
    agreementDate: String(value.agreementDate || ''),
    owner: value.owner === 'LANDOWNER' ? 'LANDOWNER' : 'DEVELOPER',
    unitNo: String(value.unitNo || ''),
    projectName: String(value.projectName || ''),
    applicantLines: Array.isArray(value.applicantLines) ? value.applicantLines.map(String) : [],
    milestoneLabel: String(value.milestoneLabel || ''),
    account: (value.account || RECEIVING_ACCOUNTS.DEVELOPER) as ReceivingAccount,
    propertyValuePaise: paise('propertyValuePaise'),
    installmentPaise: paise('installmentPaise'),
    gstPaise: paise('gstPaise'),
    principalReceivedPaise: paise('principalReceivedPaise'),
    gstReceivedPaise: paise('gstReceivedPaise'),
    principalOutstandingPaise: paise('principalOutstandingPaise'),
    gstOutstandingPaise: paise('gstOutstandingPaise'),
    priorBalances: Array.isArray(value.priorBalances)
      ? value.priorBalances.map((item) => {
          const row = item as Record<string, unknown>
          return {
            referenceNumber: String(row.referenceNumber || ''),
            issueDate: String(row.issueDate || ''),
            principalOutstandingPaise: toHundredths(row.principalOutstandingPaise) ?? 0n,
            gstOutstandingPaise: toHundredths(row.gstOutstandingPaise) ?? 0n,
          }
        })
      : [],
  }
}

/** One paragraph per earlier demand note that still has money unpaid. */
export function priorDemandLines(balances: PriorDemandBalance[] | undefined): string[] {
  return (balances || [])
    .map((item) => {
      const remaining = item.principalOutstandingPaise + item.gstOutstandingPaise
      if (remaining <= 0n || !item.referenceNumber) return ''
      const dated = formatLetterDate(item.issueDate) || item.issueDate
      return `We further wish to bring to your attention that an amount of ${formatRs(remaining)} remains outstanding against our earlier Demand Note No. ${item.referenceNumber}, dated ${dated}, after adjustment of payments received.`
    })
    .filter(Boolean)
}

function projectTitle(name: string): string {
  return (name || 'ANANDAM').trim().toUpperCase()
}

export function demandIntro(snapshot: Pick<DemandSnapshot, 'owner' | 'unitNo' | 'projectName' | 'agreementDate'>): string[] {
  const project = projectTitle(snapshot.projectName)
  const dated = formatLetterDate(snapshot.agreementDate) || snapshot.agreementDate
  if (snapshot.owner === 'LANDOWNER') {
    return [
      `This refers to the Agreement for Sale dated ${dated} executed between BALAJI PROJECTS AND HOSPITALITY PRIVATE LIMITED and you in respect of Flat No. ${snapshot.unitNo} in our project '${project}'. This demand note is being raised on behalf of the Landowner as flat no. ${snapshot.unitNo} falls under the allocation of Landowner M/s Balaji Projects and Hospitality Private Limited, Ranchi.`,
      'As per the payment schedule, the following amount is due for payment.',
    ]
  }
  return [
    `This refers to the Agreement for Sale dated ${dated} executed between LEVEL UP BUILDCON and you in respect of Flat No. ${snapshot.unitNo} in our project '${project}'. As per the construction-linked payment schedule, the following amount is due for payment.`,
  ]
}

export function demandBlocks(snapshot: DemandSnapshot, options?: { statement?: boolean; statementDate?: string }): LetterBlock[] {
  const statement = Boolean(options?.statement)
  const project = projectTitle(snapshot.projectName)
  const outstanding = snapshot.principalOutstandingPaise + snapshot.gstOutstandingPaise
  const earlier = statement ? [] : priorDemandLines(snapshot.priorBalances)
  const intro = statement
    ? [
        `This payment statement updates the balances for demand note ${snapshot.referenceNumber} issued on ${formatLetterDate(snapshot.issueDate)}. It does not replace that demand note.`,
      ]
    : demandIntro(snapshot)
  const rows = [
    ['Total property value', formatRs(snapshot.propertyValuePaise)],
    [`Installment: ${snapshot.milestoneLabel}`, formatRs(snapshot.installmentPaise)],
    ['GST applicable to the installment', formatRs(snapshot.gstPaise)],
    ['Amount already received against this installment', formatRs(snapshot.principalReceivedPaise)],
    ['GST already received', formatRs(snapshot.gstReceivedPaise)],
    ['Outstanding installment amount', formatRs(snapshot.principalOutstandingPaise)],
    ['Outstanding GST', formatRs(snapshot.gstOutstandingPaise)],
    ['Total outstanding', `${formatRs(outstanding)} (${rsWithWords(outstanding)})`],
  ]
  const blocks: LetterBlock[] = [
    { kind: 'line', text: statement ? 'PAYMENT STATEMENT' : 'DEMAND NOTE', bold: true, center: true, gapAfter: 10 },
    { kind: 'line', text: `${statement ? 'For demand note' : 'Demand Note No.'} ${snapshot.referenceNumber}`, bold: true, gapAfter: 2 },
    { kind: 'line', text: `Date ${formatLetterDate(statement ? options?.statementDate || snapshot.issueDate : snapshot.issueDate)}`, gapAfter: 10 },
    { kind: 'line', text: 'To,', gapAfter: 2 },
    ...snapshot.applicantLines.map((line) => ({ kind: 'line' as const, text: line, gapAfter: 0 })),
    { kind: 'line', text: '', gapAfter: 6 },
    { kind: 'line', text: `Subject: Demand Note for Instalment towards Flat No. ${snapshot.unitNo} in Project '${project}'`, bold: true, gapAfter: 10 },
    ...intro.map((text) => ({ kind: 'paragraph' as const, text })),
    {
      kind: 'grid',
      boldLast: true,
      columns: [
        { header: 'Particulars', width: 320, align: 'left' },
        { header: 'Amount (Rs.)', width: 148, align: 'right' },
      ],
      rows,
    },
    ...(earlier.length
      ? [
          { kind: 'line' as const, text: 'Outstanding Amount Against Previous Demand Note', bold: true, gapAfter: 6 },
          ...earlier.map((text) => ({ kind: 'paragraph' as const, text })),
          {
            kind: 'paragraph' as const,
            text: 'You are hereby requested to clear the aforesaid outstanding amount along with the amount payable under the present Demand Note.',
          },
        ]
      : []),
    {
      kind: 'paragraph',
      text: `Kindly remit the above amount within ${paymentDayPhrase(snapshot.paymentDays)} days from the date of this Demand Letter as per the Agreement for Sale.`,
    },
    { kind: 'line', text: 'Payment Details', bold: true, gapAfter: 4 },
    {
      kind: 'table',
      rows: [
        { label: 'Account Name', value: snapshot.account.accountName },
        { label: 'Bank', value: snapshot.account.bank },
        { label: 'Branch', value: snapshot.account.branch },
        { label: 'Account No.', value: snapshot.account.accountNumber },
        { label: 'IFSC', value: snapshot.account.ifsc },
      ],
    },
    {
      kind: 'paragraph',
      text: `Kindly mention your Name and Flat No. ${snapshot.unitNo} while making the payment and share the payment confirmation with our office.`,
    },
    {
      kind: 'paragraph',
      text: 'This Demand Letter forms an integral part of the Agreement for Sale and is issued in accordance with the construction-linked payment schedule agreed between the parties.',
    },
    { kind: 'paragraph', text: 'Please ignore this Demand Letter if payment has already been made.' },
    { kind: 'signature', style: 'demand' },
  ]
  return blocks
}
