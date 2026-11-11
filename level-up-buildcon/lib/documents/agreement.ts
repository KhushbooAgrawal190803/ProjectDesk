import { readFile } from 'fs/promises'
import path from 'path'
import { formatAmountFigures, formatLetterDate } from '@/lib/documents/inr-words'
import {
  BLANK,
  MASTER_SCHEDULE_CODES,
  agreementDateParts,
  amountWords,
  boundaryLabel,
  countWithWord,
  chequeBanks,
  financeParagraphs,
  joinNames,
  ordinal,
  ordinalSuffix,
  paymentEntryLines,
  relationPhrase,
  roman,
  rs,
  rsSpaced,
  type AgreementFinance,
  type AgreementPayment,
  type ScheduleLine,
} from '@/lib/documents/agreement-wording'
import { avoidStrayLines, holdParagraphsTogether, holdTablesTogether } from '@/lib/documents/agreement-layout'
import {
  TemplateMismatch,
  joinParagraphs,
  paragraphRuns,
  paragraphText,
  printInBlack,
  rawText,
  readDocumentXml,
  replaceText,
  runLike,
  splitParagraphs,
  writeDocumentXml,
} from '@/lib/documents/docx-fill'

export interface AgreementParty {
  salutation?: string | null
  name: string
  relationship?: string | null
  relativeName?: string | null
  occupation?: string | null
  aadhaar?: string | null
  pan?: string | null
  mobile?: string | null
  /** Street lines, then "City, State-PIN" last. */
  addressLines: string[]
}

export interface AgreementDocumentInput {
  /** ISO date the agreement is executed. */
  executionDate: string
  unitNo: string
  floorNo: string
  builtUp: string
  superBuiltUp: string
  landShare: string
  /** ISO date of the allotment letter. */
  allotmentDate: string
  parkingCount: number
  boundaries: { east: string; west: string; north: string; south: string }
  considerationPaise: bigint
  gstPaise: bigint
  /** Booking money actually received. Expected bank money is never part of this. */
  bookingPaidPaise: bigint
  parties: AgreementParty[]
  /** Received payments only. */
  payments: AgreementPayment[]
  /** Which of the three approved booking-amount wordings applies. */
  finance: AgreementFinance
  schedule: ScheduleLine[]
}

const TEMPLATE = path.join(process.cwd(), 'assets/agreements/developer-type1-even-1803.docx')

function filled(value: string | null | undefined): string {
  return (value || '').trim() || BLANK
}

function partyName(party: AgreementParty): string {
  return `${(party.salutation || '').trim()} ${party.name.trim()}`.trim()
}

/** Fills the allottee description once for each allottee, in the master's own runs. */
function allotteeParagraph(paragraph: string, parties: AgreementParty[]): string {
  const { head, runs, tail } = paragraphRuns(paragraph)
  const fixedFrom = runs.findIndex((run) => rawText(run).includes('Indian Citizen'))
  if (fixedFrom <= 1) throw new TemplateMismatch('allottee description')
  const sample = runs.slice(0, fixedFrom).join('')
  const plainBold = runs[1]
  const blocks = parties.map((party) => {
    let block = sample
    block = replaceText(block, /Mr\.X+/, partyName(party), { what: 'allottee name' })
    block = replaceText(block, /(?<=UID Number\s+)X+/, filled(party.aadhaar), { what: 'UID number' })
    block = replaceText(block, /(?<=PAN )X+/, filled(party.pan), { what: 'PAN' })
    block = replaceText(block, /(?<=Mobile Number )X+/, filled(party.mobile), { what: 'mobile number' })
    block = replaceText(block, /wife of Mr\. X+/, relationPhrase(party.salutation, party.relationship, party.relativeName), { what: 'relationship' })
    block = replaceText(block, /(?<=by occupation )Housewife/, filled(party.occupation), { what: 'occupation' })
    block = replaceText(block, /(?<=presently residing at\s+)X+ , X+ ,Main Road, Ranchi ,Jharkhand-834001/, party.addressLines.join(', ') || BLANK, { what: 'address' })
    return block
  })
  const joined = blocks.join(runLike(plainBold, 'and '))
  return head + joined + runs.slice(fixedFrom).join('') + tail
}

function boundaryParagraph(paragraph: string, direction: string, value: string): string {
  if (!paragraphText(paragraph).startsWith(direction)) throw new TemplateMismatch(`${direction} boundary`)
  const cleared = replaceText(paragraph, /(?<=:-).*$/, '     ', { what: `${direction} boundary` })
  const { runs } = paragraphRuns(cleared)
  const body = cleared.slice(0, cleared.length - '</w:p>'.length)
  return `${body}${runLike(runs[0], boundaryLabel(value), { bold: true })}</w:p>`
}

/** Spacing, indent and justification of a body paragraph, without its character formatting. */
function bodyLayout(paragraph: string): string {
  const properties = paragraph.match(/^<w:p\b[^>]*><w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1]
  if (!properties) throw new TemplateMismatch('body paragraph layout')
  return properties.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '')
}

/** Gives a paragraph another paragraph's layout. Its own text and character formatting stay. */
function withLayout(paragraph: string, layout: string): string {
  const open = paragraph.match(/^<w:p\b[^>]*>/)?.[0]
  if (!open) return paragraph
  const rest = paragraph.slice(open.length)
  const own = rest.startsWith('<w:pPr>') ? rest.slice('<w:pPr>'.length, rest.indexOf('</w:pPr>')) : ''
  const after = rest.startsWith('<w:pPr>') ? rest.slice(rest.indexOf('</w:pPr>') + '</w:pPr>'.length) : rest
  const characters = own.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || ''
  return `${open}<w:pPr>${layout}${characters}</w:pPr>${after}`
}

/** Schedule C. Rows the master already words are kept verbatim; only the number and amount change. */
function scheduleTable(xml: string, schedule: ScheduleLine[]): string {
  const tables = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)]
  const found = tables.find((match) => rawText(match[0]).includes('Milestone') && rawText(match[0]).includes('Sr. No.'))
  if (!found || found.index == null) throw new TemplateMismatch('Schedule C table')
  const table = found[0]
  const rows: string[] = table.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []
  if (rows.length !== MASTER_SCHEDULE_CODES.length + 2) throw new TemplateMismatch('Schedule C rows')
  const firstRow = table.indexOf(rows[0])
  const lastRow = table.lastIndexOf(rows[rows.length - 1])
  const before = table.slice(0, firstRow)
  const after = table.slice(lastRow + rows[rows.length - 1].length)

  const masterRow = (code: string | null) => {
    const index = code ? MASTER_SCHEDULE_CODES.indexOf(code as (typeof MASTER_SCHEDULE_CODES)[number]) : -1
    return index >= 0 ? rows[index + 1] : null
  }
  const plainRow = rows[MASTER_SCHEDULE_CODES.indexOf('BASEMENT') + 1]

  const body = schedule.map((line, index) => {
    let row = masterRow(line.code)
    if (!row) {
      row = replaceText(plainRow, 'Before the casting of Basement', line.label || BLANK, { what: 'Schedule C milestone' })
    }
    row = replaceText(row, /\([ivxl]+\)/, `(${roman(index + 1)})`, { what: 'Schedule C serial' })
    return replaceText(row, /X+\/-/, `${formatAmountFigures(line.amountPaise)}/-`, { what: 'Schedule C amount' })
  })

  const total = schedule.reduce((sum, line) => sum + line.amountPaise, 0n)
  let totalRow = rows[rows.length - 1]
  totalRow = replaceText(totalRow, /Rs\.X+\/-/, rs(total), { what: 'Schedule C total' })
  totalRow = replaceText(totalRow, /Rs\.X+(?=Only)/, `${amountWords(total)} `, { what: 'Schedule C total in words' })

  const rebuilt = before + [rows[0], ...body, totalRow].join('') + after
  return xml.slice(0, found.index) + rebuilt + xml.slice(found.index + table.length)
}

export async function buildAgreementDocx(input: AgreementDocumentInput): Promise<Buffer> {
  let template: Buffer
  try {
    template = await readFile(TEMPLATE)
  } catch {
    throw new Error('The developer agreement template is missing.')
  }
  const dated = agreementDateParts(input.executionDate)
  if (!dated) throw new Error('Agreement for Sale date is not a valid date.')
  if (!input.parties.length) throw new Error('The agreement needs at least one allottee.')

  const { zip, xml: original } = readDocumentXml(template)
  const xml = scheduleTable(original, input.schedule)
  const { glue, parts } = splitParagraphs(xml)
  const texts = parts.map(paragraphText)

  const find = (needle: string, what: string) => {
    const index = texts.findIndex((text) => text.includes(needle))
    if (index < 0) throw new TemplateMismatch(what)
    return index
  }
  const edit = (index: number, pattern: RegExp | string, replacement: string, what: string, bold = false) => {
    parts[index] = replaceText(parts[index], pattern, replacement, { what, bold })
  }

  const floorNumber = Number(input.floorNo)
  const numberedFloor = Number.isInteger(floorNumber) && floorNumber > 0
  const floorFigure = numberedFloor ? String(floorNumber) : input.floorNo.trim() || BLANK
  const floorSuffix = numberedFloor ? ordinalSuffix(floorNumber) : ''
  const floorOrdinal = numberedFloor ? ordinal(floorNumber) : floorFigure
  const parking = input.parkingCount > 0 ? countWithWord(input.parkingCount) : BLANK
  const allotmentDate = formatLetterDate(input.allotmentDate) || BLANK
  const primary = input.parties[0]

  // Opening line: "executed on this XXth day of XXXXXXX, 20XX, at Ranchi."
  const dateIndex = find('This Agreement for Sale', 'execution date')
  edit(dateIndex, /XXth(?= day of)/, `${dated.day}${dated.suffix}`, 'day of execution')
  edit(dateIndex, /(?<=day of\s+)X+/, dated.month, 'month of execution')
  if (dated.year.startsWith('20')) edit(dateIndex, /(?<=, 20)XX/, dated.year.slice(2), 'year of execution')
  else edit(dateIndex, /20XX/, dated.year, 'year of execution')

  // The allottee, repeated for joint allottees.
  const partyIndex = find('UID Number', 'allottee description')
  parts[partyIndex] = allotteeParagraph(parts[partyIndex], input.parties)

  // Recital E.
  const appliedIndex = find('has applied for allotment of Flat No.', 'recital E')
  edit(appliedIndex, /(?<=Flat No\.)X01/, input.unitNo, 'flat number in recital E')
  edit(appliedIndex, /(?<=on the )X(?=th\s+Floor)/, floorFigure, 'floor in recital E')
  edit(appliedIndex, /(?<=on the \S+)th(?=\s+Floor)/, floorSuffix, 'floor suffix in recital E')
  edit(appliedIndex, /(?<=area )1387(?= Square Feet of Built-Up Area)/, input.builtUp, 'built-up area in recital E')
  edit(appliedIndex, /(?<=Super built up Area )1803/, input.superBuiltUp, 'super built-up area in recital E')

  // Recital F.
  const purchaseIndex = find('Allotment Letter dated', 'recital F')
  edit(purchaseIndex, /(?<=Allotment Letter dated\s+)XX\.XX\.XXXX/, allotmentDate, 'allotment letter date')
  edit(purchaseIndex, /(?<=Unit No\.)X01/, input.unitNo, 'unit number in recital F')
  edit(purchaseIndex, /(?<=on the )Xth(?= floor)/, floorOrdinal, 'floor in recital F')
  edit(purchaseIndex, /(?<=area )1387(?= Square Feet of Built-Up Area)/, input.builtUp, 'built-up area in recital F')
  edit(purchaseIndex, /(?<=Super built up Area )1803/, input.superBuiltUp, 'super built-up area in recital F')
  edit(purchaseIndex, /X \(XXX\)(?= covered car parking)/, parking, 'parking in recital F')

  // Article I: consideration, then the approved booking-amount wording for
  // the way this booking is funded. Both paragraphs take the spacing and
  // justification of the body text around them.
  const saleIndex = find('total lump-sum consideration', 'Article I')
  const chequeIndex = find('the aforesaid cheques are drawn on', 'cheque acknowledgment')
  if (chequeIndex !== saleIndex + 1) throw new TemplateMismatch('payment details position')
  const body = bodyLayout(parts[find('NOW, THEREFORE', 'body paragraph')])
  const plainRun = paragraphRuns(parts[chequeIndex]).runs[1]
  if (!plainRun) throw new TemplateMismatch('cheque acknowledgment runs')
  const bodyParagraph = (text: string, layout = body) => `<w:p><w:pPr>${layout}</w:pPr>${runLike(plainRun, text)}</w:p>`

  edit(saleIndex, /(?<=Flat No\.)X01/, input.unitNo, 'flat number in Article I')
  edit(saleIndex, /Rs\.X+\/-/, rs(input.considerationPaise), 'total consideration')
  edit(saleIndex, /Rs\.X+(?= Only)/, amountWords(input.considerationPaise), 'total consideration in words')
  const paid = input.bookingPaidPaise > 0n
  edit(saleIndex, /₹\s*(?=Rs\.X)/, '', 'booking amount currency mark')
  edit(saleIndex, /Rs\.X+\/-/, paid ? rsSpaced(input.bookingPaidPaise) : `Rs. ${BLANK}/-`, 'booking amount')
  edit(saleIndex, /Rs\.X+(?= Only)/, paid ? amountWords(input.bookingPaidPaise) : `Rupees ${BLANK}`, 'booking amount in words')
  parts[saleIndex] = withLayout(parts[saleIndex], body)

  const entryLayout = body.replace(/<w:ind\b[^>]*\/>/, '<w:ind w:left="875" w:right="125"/>')
  parts[saleIndex] += paymentEntryLines(input.payments).map((line) => bodyParagraph(line, entryLayout)).join('')

  const bankFunded = financeParagraphs(input.finance)
  if (bankFunded.length) {
    // Scenarios 2 and 3 close with the bank paragraphs.
    parts[chequeIndex] = bankFunded.map((line) => bodyParagraph(line)).join('')
  } else {
    // Scenario 1 closes with the acknowledgment, worded for the instrument used.
    const banks = chequeBanks(input.payments)
    if (banks != null) {
      edit(chequeIndex, /^\s*the aforesaid cheques/, 'The aforesaid cheque(s)', 'cheque acknowledgment')
      edit(chequeIndex, /(?<=drawn on )X+/, banks, 'drawee bank')
      edit(chequeIndex, /(?<=realization of the said )cheques/, 'cheque(s)', 'cheque acknowledgment')
    } else {
      edit(chequeIndex, /^\s*the aforesaid cheques are drawn on X+, and the Promoter/, 'The Promoter', 'payment acknowledgment')
      edit(chequeIndex, /, subject to realization of the said cheques/, '', 'payment acknowledgment')
    }
    parts[chequeIndex] = withLayout(parts[chequeIndex], body)
  }

  // Table at 1.1.
  const priceCells = texts.map((text, index) => ({ text, index })).filter((cell) => /^Rs\.X+\/-$/.test(cell.text))
  if (priceCells.length !== 2) throw new TemplateMismatch('consideration table')
  for (const cell of priceCells) edit(cell.index, /Rs\.X+\/-/, rs(input.considerationPaise), 'consideration table')
  const gstIndex = texts.findIndex((text) => /^Rs\. X+\/-$/.test(text))
  if (gstIndex < 0) throw new TemplateMismatch('GST in the consideration table')
  edit(gstIndex, /Rs\. X+\/-/, `Rs. ${formatAmountFigures(input.gstPaise)}/-`, 'GST in the consideration table')

  // 6.11 Notices.
  const noticeIndex = texts.findIndex((text) => /^Mr\s+X+$/.test(text))
  if (noticeIndex < 0) throw new TemplateMismatch('allottee name in notices')
  if (!/^X+$/.test(texts[noticeIndex + 1]) || !/^X+$/.test(texts[noticeIndex + 2])) throw new TemplateMismatch('address in notices')
  const lines = primary.addressLines
  edit(noticeIndex, /Mr\s+X+/, joinNames(input.parties.map(partyName)), 'allottee name in notices')
  edit(noticeIndex + 1, /X+/, lines[0] || BLANK, 'address in notices')
  // The master has two street lines. A short address leaves the second one out.
  if (lines.length > 2) edit(noticeIndex + 2, /X+/, lines.slice(1, -1).join(', '), 'address in notices')
  else parts[noticeIndex + 2] = ''
  edit(noticeIndex + 3, /Ranchi , Jharkhand-X+/, lines.length > 1 ? lines[lines.length - 1] : BLANK, 'city in notices')

  // Schedule B.
  const scheduleB = find('ALL THAT Flat measuring', 'Schedule B')
  edit(scheduleB, /(?<=super built up area )1803/, input.superBuiltUp, 'super built-up area in Schedule B')
  edit(scheduleB, /(?<=Flat No\. )X01/, input.unitNo, 'flat number in Schedule B')
  edit(scheduleB, /(?<=on the )X(?=th\s+Floor)/, floorFigure, 'floor in Schedule B', true)
  edit(scheduleB, /(?<=on the \S+)th(?=\s+Floor)/, floorSuffix, 'floor suffix in Schedule B')
  edit(scheduleB, /XXXX(?= covered car parking)/, parking, 'parking in Schedule B')
  edit(scheduleB, /546(?= sq\. ft\.)/, input.landShare, 'undivided land share')
  parts[scheduleB + 1] = boundaryParagraph(parts[scheduleB + 1], 'North', input.boundaries.north)
  parts[scheduleB + 2] = boundaryParagraph(parts[scheduleB + 2], 'South', input.boundaries.south)
  parts[scheduleB + 3] = boundaryParagraph(parts[scheduleB + 3], 'East', input.boundaries.east)
  parts[scheduleB + 4] = boundaryParagraph(parts[scheduleB + 4], 'West', input.boundaries.west)

  const parkingIndex = find('«Parking»', 'parking note')
  edit(parkingIndex, '«Parking»', input.parkingCount > 0 ? `${parking} covered car parking space` : BLANK, 'parking note')

  // Layout last: the wording is settled, only page breaks are guided.
  holdParagraphsTogether(glue, parts, texts)
  avoidStrayLines(zip)
  return writeDocumentXml(zip, printInBlack(holdTablesTogether(joinParagraphs(glue, parts))))
}
