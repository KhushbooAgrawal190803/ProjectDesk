import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  BLANK,
  agreementDateParts,
  amountWords,
  boundaryLabel,
  countWithWord,
  chequeBanks,
  financeParagraphs,
  paymentEntryLines,
  relationPhrase,
  rs,
  scheduleCLines,
  type ScheduleSource,
} from '@/lib/documents/agreement-wording'
import { boundaryMatch } from '@/lib/data/flat-boundaries'
import { groupDemandDownloads } from '@/lib/downloads/groups'
import { istDateLabel } from '@/app/(dashboard)/dashboard/ist-date'
import { buildAgreementDocx, type AgreementDocumentInput } from '@/lib/documents/agreement'
import { agreementReadiness } from '@/lib/documents/agreement-ready'
import { rawText, readDocumentXml, replaceText, splitParagraphs } from '@/lib/documents/docx-fill'

const cheque = {
  payer: 'Mrs. Meera Kapoor',
  amountPaise: 50000000n,
  mode: 'Cheque',
  reference: '004512',
  date: '2026-11-01',
  bank: 'State Bank of India',
}

const STANDARD: ScheduleSource[] = [
  { code: 'AGREEMENT', label: '20% at the time of execution of the Agreement', amountPaise: 180000000n },
  { code: 'BASEMENT', label: '10% before casting of Basement slab', amountPaise: 90000000n },
  { code: 'GROUND', label: '10% before casting of Ground slab', amountPaise: 90000000n },
  ...[1, 2, 3, 4, 5].map((floor) => ({ code: `FLOOR_${floor}`, label: `6% floor ${floor}`, amountPaise: 54000000n })),
  ...[6, 7, 8, 9, 10].map((floor) => ({ code: `FLOOR_${floor}`, label: `5% floor ${floor}`, amountPaise: 45000000n })),
  { code: 'HANDOVER', label: '5% at the time of Handover/ Registry of flat', amountPaise: 45000000n },
]

function sampleInput(overrides: Partial<AgreementDocumentInput> = {}): AgreementDocumentInput {
  return {
    executionDate: '2026-11-11',
    unitNo: '506',
    floorNo: '5',
    builtUp: '1175.7',
    superBuiltUp: '1528',
    landShare: '463',
    allotmentDate: '2026-11-06',
    parkingCount: 1,
    boundaries: { east: 'Open space of anandam', west: 'Flat no. 505', north: 'Open space of anandam', south: 'Flat no. 507' },
    considerationPaise: 900000000n,
    gstPaise: 45000000n,
    bookingPaidPaise: 50000000n,
    parties: [{
      salutation: 'Mrs.',
      name: 'Meera Kapoor',
      relationship: 'Husband',
      relativeName: 'Arjun Kapoor',
      occupation: 'Doctor',
      aadhaar: '123412341234',
      pan: 'ABCDE1234F',
      mobile: '9999999999',
      addressLines: ['14 Circular Road', 'Hindpiri', 'Ranchi, Jharkhand-834001'],
    }],
    payments: [cheque],
    finance: { scenario: 'purchaser', bankName: '', loanSanctioned: null },
    schedule: scheduleCLines(STANDARD, 50000000n).lines,
    ...overrides,
  }
}

function paragraphsOf(docx: Buffer): string[] {
  return splitParagraphs(readDocumentXml(docx).xml).parts.map(rawText)
}

const MASTER = readFileSync(path.join(process.cwd(), 'assets/agreements/developer-type1-even-1803.docx'))
/** Master paragraphs that carry a blank or a flat-specific value. Everything else must come through untouched. */
const VARIABLE = /X{2,}|X0\d|«|1387|1803|546 sq|Housewife|Daladali-Road|OPEN SPACE {2}OF|\((?:i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv)\)$/

describe('agreement wording', () => {
  it('writes amounts, dates and counts the way the master does', () => {
    expect(rs(710100000n)).toBe('Rs.71,01,000/-')
    expect(amountWords(710100000n)).toBe('Rupees Seventy-One Lakhs One Thousand')
    expect(agreementDateParts('2026-11-01')).toEqual({ day: '1', suffix: 'st', month: 'November', year: '2026' })
    expect(agreementDateParts('2026-10-22')?.suffix).toBe('nd')
    expect(countWithWord(1)).toBe('1 (One)')
    expect(boundaryLabel('flat no.303')).toBe('Flat No. 303')
    expect(boundaryLabel('Open space of anandam')).toBe('OPEN SPACE OF ANANDAM')
    expect(boundaryLabel('Daladali-Road')).toBe('Daladali-Road')
  })

  it('names the relationship from the salutation and leaves a blank when it is unknown', () => {
    expect(relationPhrase('Mrs.', 'Husband', 'Arjun Mishra')).toBe('wife of Mr. Arjun Mishra')
    expect(relationPhrase('Mr.', 'Father', 'Sri Suresh Kapoor')).toBe('son of Sri Suresh Kapoor')
    expect(relationPhrase('Miss', 'Mother', 'Usha Mishra')).toBe('daughter of Mrs. Usha Mishra')
    expect(relationPhrase('Mrs.', '', 'Rajesh Kapoor')).toBe(`${BLANK} of Rajesh Kapoor`)
  })

  it('words each received payment as approved, and names the instrument actually used', () => {
    expect(paymentEntryLines([cheque])).toEqual([
      '(a) Rs. 5,00,000/- (Rupees Five Lakhs Only) vide Cheque No. 004512 dated 01.11.2026, issued in the name of Mrs. Meera Kapoor;',
    ])
    const neft = { payer: 'Mr. Rohan Kapoor', amountPaise: 25000000n, mode: 'NEFT_RTGS', reference: 'UTR99', date: '2026-11-03', bank: 'HDFC Bank' }
    const cash = { payer: 'Mr. Rohan Kapoor', amountPaise: 10000000n, mode: 'Cash', reference: '', date: '2026-11-04' }
    expect(paymentEntryLines([cheque, neft, cash]).slice(1)).toEqual([
      '(b) Rs. 2,50,000/- (Rupees Two Lakhs Fifty Thousand Only) vide NEFT/RTGS Reference No. UTR99 dated 03.11.2026, remitted by Mr. Rohan Kapoor;',
      '(c) Rs. 1,00,000/- (Rupees One Lakh Only) in cash on 04.11.2026, paid by Mr. Rohan Kapoor;',
    ])
    expect(paymentEntryLines([])).toEqual([
      `(a) Rs. ${BLANK}/- (Rupees ${BLANK} Only) vide Cheque No. ${BLANK} dated ${BLANK}, issued in the name of ${BLANK};`,
    ])
    // Only cheques are "drawn on" a bank.
    expect(chequeBanks([cheque, neft])).toBe('State Bank of India')
    expect(chequeBanks([cheque, { ...cheque, bank: '' }])).toBe(`State Bank of India and ${BLANK}`)
    expect(chequeBanks([neft])).toBeNull()
    expect(chequeBanks([])).toBe(BLANK)
  })

  it('uses the approved bank-finance paragraphs and the loan phrase for the sanction status', () => {
    expect(financeParagraphs({ scenario: 'purchaser', bankName: 'HDFC Bank', loanSanctioned: true })).toEqual([])
    expect(financeParagraphs({ scenario: 'split_50_50', bankName: 'HDFC Bank', loanSanctioned: true })).toEqual([
      "Out of the 20% booking amount specified in Schedule 'C' of the Agreement, 10% of the Total Consideration shall be paid directly by the Allottee(s) (Client), and the remaining 10% shall be disbursed by HDFC Bank, subject to the terms and conditions of the sanctioned housing loan, where applicable.",
      "The amount to be disbursed by the financing bank shall remain payable until actually received by the Promoter. All subsequent installments shall be payable in accordance with Schedule 'C' of this Agreement.",
    ])
    expect(financeParagraphs({ scenario: 'split_10_90', bankName: 'HDFC Bank', loanSanctioned: false })).toEqual([
      "Out of the 20% booking amount specified in Schedule 'C' of the Agreement, 10% of the said booking amount shall be paid directly by the Allottee(s) (Client), and the remaining 90% shall be disbursed by HDFC Bank, subject to sanction, disbursement and the terms and conditions of the proposed housing loan.",
      "The same payment arrangement shall apply to all subsequent construction-linked installments/slabs mentioned in Schedule 'C', whereby 10% of each installment amount shall be contributed by the Allottee(s) (Client), and the remaining 90% shall be disbursed by HDFC Bank, subject to the terms and conditions of the housing loan.",
      'Any amount to be disbursed by the financing bank, whether towards the booking amount or any subsequent installment, shall remain payable until actually received by the Promoter.',
    ])
    expect(financeParagraphs({ scenario: 'split_50_50', bankName: '', loanSanctioned: null })[0]).toContain(`disbursed by ${BLANK}, subject to the terms and conditions of the sanctioned housing loan, where applicable.`)
  })

  it('shows the booking amount on its own Schedule C line without changing the total', () => {
    const { lines, bookingShown } = scheduleCLines(STANDARD, 50000000n)
    expect(bookingShown).toBe(true)
    expect(lines).toHaveLength(15)
    expect(lines[0]).toMatchObject({ code: 'BOOKING', amountPaise: 50000000n })
    expect(lines[1]).toMatchObject({ code: 'AGREEMENT', amountPaise: 130000000n })
    expect(lines.reduce((sum, line) => sum + line.amountPaise, 0n)).toBe(900000000n)
    expect(scheduleCLines(STANDARD, 500000000n).bookingShown).toBe(false)
  })

  it('splits the received amount out of an agreement instalment under equivalent labels', () => {
    const received = 175000000n
    const agreement = 243572000n
    const interim = 365358000n
    const handover = 608930000n
    const total = agreement + interim + handover
    for (const label of ['At agreement', 'At execution of agreement', 'On signing of agreement']) {
      const { lines, bookingShown } = scheduleCLines([
        { code: null, label, amountPaise: agreement },
        { code: null, label: 'Interim payment', date: '2026-09-15', amountPaise: interim },
        { code: 'HANDOVER', label: 'At the time of Handover/ Registry of flat', amountPaise: handover },
      ], received)
      expect(bookingShown).toBe(true)
      expect(lines.map((line) => [line.code, line.amountPaise])).toEqual([
        ['BOOKING', received],
        ['AGREEMENT', 68572000n],
        [null, interim],
        ['HANDOVER', handover],
      ])
      expect(lines.reduce((sum, line) => sum + line.amountPaise, 0n)).toBe(total)
      expect(lines.filter((line) => line.code === 'BOOKING')).toHaveLength(1)
    }

    const other = scheduleCLines([
      { code: null, label: 'Token recorded on the booking form', amountPaise: 100000000n },
      { code: null, label: 'At execution of agreement', amountPaise: 400000000n },
      { code: 'HANDOVER', label: 'At handover', amountPaise: 500000000n },
    ], 250000000n)
    expect(other.lines.map((line) => [line.code, line.amountPaise])).toEqual([
      ['BOOKING', 250000000n],
      [null, 100000000n],
      ['AGREEMENT', 150000000n],
      ['HANDOVER', 500000000n],
    ])
    expect(other.lines.reduce((sum, line) => sum + line.amountPaise, 0n)).toBe(1000000000n)

    const tooMuch = scheduleCLines([
      { code: null, label: 'At agreement', amountPaise: 100000000n },
      { code: 'HANDOVER', label: 'At handover', amountPaise: 100000000n },
    ], 150000000n)
    expect(tooMuch.bookingShown).toBe(false)
    expect(tooMuch.lines.map((line) => line.amountPaise)).toEqual([100000000n, 100000000n])

    const unpaid = scheduleCLines([{ code: null, label: 'On signing of agreement', amountPaise: agreement }], 0n)
    expect(unpaid.bookingShown).toBe(false)
    expect(unpaid.lines).toEqual([{ code: null, label: 'On signing of agreement', amountPaise: agreement }])
  })
})

describe('boundaries from the new schedule', () => {
  it('uses the dictated sheet and does not fall back for a missing flat', () => {
    expect(boundaryMatch('206')).toMatchObject({
      state: 'found',
      boundaries: { north: 'Open space of anandam', south: 'Flat no. 207' },
    })
    expect(boundaryMatch('101').state).toBe('missing')
    expect(boundaryMatch('').state).toBe('empty')
  })
})

describe('demand download groups', () => {
  it('keeps a future date in its own group without a file', () => {
    const groups = groupDemandDownloads([
      { trigger: 'Before casting of 1st floor slab', due: true, noteId: 'a' },
      { trigger: '3 December 2026', due: false },
      { trigger: '1 January 2027', due: false },
    ])
    expect(groups.find((group) => group.title.startsWith('Before'))?.status).toBe('ready')
    expect(groups.find((group) => group.title === '3 December 2026')?.status).toBe('not_due')
    expect(groups.find((group) => group.title === '1 January 2027')?.noteIds).toEqual([])
  })
})

describe('IST date', () => {
  it('formats the Kolkata calendar date without a time', () => {
    const label = istDateLabel(new Date('2026-11-11T20:30:00.000Z'))
    expect(label).toBe('12 November 2026')
    expect(label).not.toMatch(/\d:\d/)
  })
})

describe('filling inside Word runs', () => {
  it('keeps the runs and puts the new text in the first run it touched', () => {
    const paragraph = '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Flat No.X0</w:t></w:r><w:r><w:t>1</w:t></w:r><w:r><w:t xml:space="preserve"> on the X</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>th</w:t></w:r></w:p>'
    const unit = replaceText(paragraph, /(?<=Flat No\.)X01/, '506')
    expect(rawText(unit)).toBe('Flat No.506 on the Xth')
    expect(unit.match(/<w:r>/g)).toHaveLength(4)
    const floor = replaceText(replaceText(unit, /(?<=on the )X/, '3'), /(?<=on the \d)th/, 'rd')
    expect(floor).toContain('<w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">rd</w:t>')
    expect(() => replaceText(paragraph, 'not there', 'x')).toThrow(/no longer matches/)
  })
})

describe('agreement document', () => {
  it('fills every blank and leaves every other word of the master as it is', async () => {
    const docx = await buildAgreementDocx(sampleInput())
    const { xml } = readDocumentXml(docx)
    const filled = paragraphsOf(docx)
    const text = filled.join('\n')

    // Every paragraph of the master that has no blank in it is still there, word for word and in order.
    const fixed = paragraphsOf(MASTER).filter((paragraph) => paragraph.trim() && !VARIABLE.test(paragraph))
    expect(fixed.length).toBeGreaterThan(250)
    let cursor = 0
    for (const paragraph of fixed) {
      const at = filled.indexOf(paragraph, cursor)
      expect(at, `missing or moved: ${paragraph.slice(0, 80)}`).toBeGreaterThanOrEqual(cursor)
      cursor = at + 1
    }

    // No blank of the master is left, apart from the partners' masked UID numbers.
    expect(text.replace(/XXXX\s+XXXX\s+\d{4}/g, '')).not.toMatch(/X{2,}|X0\d|«/)
    expect(xml).not.toMatch(/w:val="(?:C00000|FF0000)"/)
    expect(xml.match(/<w:tbl>/g)).toHaveLength(3)
    expect(docx.subarray(0, 2).toString()).toBe('PK')

    expect(text).toContain('executed on this 11th day of November, 2026, at Ranchi.')
    expect(text).toContain('Mrs. Meera Kapoor (UID Number  123412341234 PAN ABCDE1234F and Mobile Number 9999999999) wife of Mr. Arjun Kapoor , by occupation Doctor , presently residing at  14 Circular Road, Hindpiri, Ranchi, Jharkhand-834001 are  Indian Citizen')
    expect(text).toContain('allotment of Flat No.506 on the 5th Floor having an area 1175.7 Square Feet of Built-Up Area, corresponding to Super built up Area 1528 Square Feet, in the Project.')
    expect(text).toContain('Allotment Letter dated  06.11.2026 ,')
    expect(text).toContain('Unit No.506 on the 5th floor of the Project')
    expect(text).toContain('along with 1 (One) covered car parking space')
    expect(text).toContain('consideration of Rs.90,00,000/- (Rupees Ninety Lakhs Only) ("TotalPrice")')
    expect(text).toContain('The Allottee(s) have hereby paid a total sum of Rs. 5,00,000/- (Rupees Five Lakhs Only) towards the booking amount, details of which are as follows:')
    expect(text).toContain('(a) Rs. 5,00,000/- (Rupees Five Lakhs Only) vide Cheque No. 004512 dated 01.11.2026, issued in the name of Mrs. Meera Kapoor;')
    expect(text).toContain('The aforesaid cheque(s) are drawn on State Bank of India, and the Promoter hereby acknowledges receipt of the aforesaid total booking amount, subject to realization of the said cheque(s).')
    expect(text).not.toContain('₹')
    expect(text).toContain('Rs. 4,50,000/-')
    expect(text).toContain('being Flat No. 506 on the 5th Floor with 1 (One) covered car parking space')
    expect(text).toContain('share of land 463 sq. ft. in the SCHEDULE-“A” land')
    expect(text).toContain('North:-     OPEN SPACE OF ANANDAM')
    expect(text).toContain('South:-     Flat No. 507')
    expect(text).toContain('West:-     Flat No. 505')
    expect(text).toContain('1 (One) covered car parking space which is')
    expect(text).toContain('Rs.90,00,000/- (Rupees Ninety Lakhs Only)')
    expect(text).toContain('ARTICLE VI: GENERAL TERMS AND MISCELLANEOUS PROVISIONS')
  })

  it('guides page breaks only: tables, headings and the signature page hold together', async () => {
    const docx = await buildAgreementDocx(sampleInput())
    const { xml } = readDocumentXml(docx)
    const { parts } = splitParagraphs(xml)
    const texts = parts.map(rawText)

    // The signature block opens a fresh page and stays on it, with every line of the master still there.
    const witness = texts.findIndex((text) => text.startsWith('IN WITNESS WHEREOF'))
    expect(parts[witness]).toContain('<w:keepNext/><w:pageBreakBefore/>')
    expect(texts[witness - 1].trim()).toBe('Yoga Deck.')
    const master = paragraphsOf(MASTER)
    const masterWitness = master.findIndex((text) => text.startsWith('IN WITNESS WHEREOF'))
    expect(texts.slice(witness)).toEqual(master.slice(masterWitness))
    for (const paragraph of parts.slice(witness, -1)) expect(paragraph).toContain('<w:keepNext/>')
    expect(parts[parts.length - 1]).not.toContain('<w:keepNext/>')

    // No row breaks across a page or cuts off its text; the two money tables stay whole.
    const tables = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []
    for (const table of tables) {
      const rows = table.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []
      for (const row of rows) expect(row).toContain('<w:cantSplit/>')
      expect(rows[0]).toContain('<w:keepNext/>')
      expect(rows[rows.length - 1]).not.toContain('<w:keepNext/>')
      if (/Milestone|Particulars/.test(rawText(table))) {
        for (const row of rows.slice(0, -1)) expect(row).not.toMatch(/<w:p[ >](?:(?!<w:keepNext\/>)[\s\S])*?<\/w:p>/)
      }
    }
    expect(xml).not.toContain('w:hRule="exact"')

    // A heading is never left at the foot of a page.
    for (const heading of ['ARTICLE I: TERMS OF SALE AND CONSIDERATION', 'SCHEDULE ‘C’', 'NOTICES', 'AMENITIES']) {
      const at = texts.findIndex((text) => text.trim() === heading)
      expect(at, heading).toBeGreaterThan(0)
      expect(parts[at]).toContain('<w:keepNext/>')
    }
    // Layout marks sit where Word expects them, straight after the paragraph style.
    const marks = xml.match(/<w:keepNext\/>/g) || []
    const placed = xml.match(/(?:<w:pPr>|<w:pStyle\b[^>]*\/>)<w:keepNext\/>/g) || []
    expect(marks.length).toBeGreaterThan(60)
    expect(placed).toHaveLength(marks.length)
  })

  it('sets Article I in the body layout and words it for each funding scenario', async () => {
    const articleOne = async (overrides: Partial<AgreementDocumentInput>) => {
      const { parts } = splitParagraphs(readDocumentXml(await buildAgreementDocx(sampleInput(overrides))).xml)
      const texts = parts.map(rawText)
      const from = texts.findIndex((item) => item.includes('total lump-sum consideration'))
      const to = texts.findIndex((item) => item.includes('is bifurcated as set out in the table below'))
      return { parts: parts.slice(from, to), texts: texts.slice(from, to) }
    }

    const purchaser = await articleOne({})
    expect(purchaser.texts).toHaveLength(3)
    for (const paragraph of purchaser.parts) {
      expect(paragraph).toContain('<w:pStyle w:val="BodyText"/>')
      expect(paragraph).toContain('w:line="360"')
      expect(paragraph).not.toContain('NormalWeb')
    }

    const neft = { payer: 'Mrs. Meera Kapoor', amountPaise: 50000000n, mode: 'NEFT_RTGS', reference: 'UTR1', date: '2026-11-01' }
    const transfer = await articleOne({ payments: [neft] })
    expect(transfer.texts[1]).toBe('(a) Rs. 5,00,000/- (Rupees Five Lakhs Only) vide NEFT/RTGS Reference No. UTR1 dated 01.11.2026, remitted by Mrs. Meera Kapoor;')
    expect(transfer.texts[2]).toBe('The Promoter hereby acknowledges receipt of the aforesaid total booking amount.')

    const nothing = await articleOne({ payments: [], bookingPaidPaise: 0n })
    expect(nothing.texts[0]).toContain(`paid a total sum of Rs. ${BLANK}/- (Rupees ${BLANK} Only) towards the booking amount`)
    expect(nothing.texts[2]).toBe(`The aforesaid cheque(s) are drawn on ${BLANK}, and the Promoter hereby acknowledges receipt of the aforesaid total booking amount, subject to realization of the said cheque(s).`)

    const tenTen = await articleOne({ finance: { scenario: 'split_50_50', bankName: 'HDFC Bank', loanSanctioned: false } })
    expect(tenTen.texts.slice(1)).toEqual([
      '(a) Rs. 5,00,000/- (Rupees Five Lakhs Only) vide Cheque No. 004512 dated 01.11.2026, issued in the name of Mrs. Meera Kapoor;',
      ...financeParagraphs({ scenario: 'split_50_50', bankName: 'HDFC Bank', loanSanctioned: false }),
    ])
    expect(tenTen.texts.join(' ')).not.toContain('aforesaid cheque')

    const tenNinety = await articleOne({ finance: { scenario: 'split_10_90', bankName: 'HDFC Bank', loanSanctioned: true } })
    expect(tenNinety.texts).toHaveLength(5)
    expect(tenNinety.texts[4]).toBe('Any amount to be disbursed by the financing bank, whether towards the booking amount or any subsequent installment, shall remain payable until actually received by the Promoter.')
  })

  it('keeps the fifteen Schedule C rows of the master for the standard plan', async () => {
    const docx = await buildAgreementDocx(sampleInput())
    const { xml } = readDocumentXml(docx)
    const table = (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []).find((item) => rawText(item).includes('Milestone')) || ''
    const rows = (table.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map(rawText)
    expect(rows).toHaveLength(17)
    expect(rows[1]).toBe('(i)At the time of Booking5,00,000/-')
    expect(rows[2]).toBe('(ii)At the time of execution of agreement 13,00,000/-')
    expect(rows[5]).toBe('(v)Before the casting of 1st floor slab5,40,000/-')
    expect(rows[15].replace(/\s+/g, ' ')).toBe('(xv)At the time of handing over of Apartment4,50,000/-')
    expect(rows[16]).toBe('Total:Rs.90,00,000/- (Rupees Ninety Lakhs Only)')
  })

  it('prints Flat 601 as a booking line and the balance due on signing', async () => {
    const received = 175000000n
    const agreement = 243572000n
    const interim = 365358000n
    const handover = 608930000n
    const total = agreement + interim + handover
    const schedule = scheduleCLines([
      { code: null, label: 'At agreement', amountPaise: agreement },
      { code: null, label: 'Interim payment', date: '2026-09-15', amountPaise: interim },
      { code: 'HANDOVER', label: 'At the time of Handover/ Registry of flat', amountPaise: handover },
    ], received).lines
    const docx = await buildAgreementDocx(sampleInput({
      considerationPaise: total,
      bookingPaidPaise: received,
      schedule,
    }))
    const { xml } = readDocumentXml(docx)
    const table = (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []).find((item) => rawText(item).includes('Milestone')) || ''
    const rows = (table.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map(rawText)
    expect(rows[1]).toBe('(i)At the time of Booking17,50,000/-')
    expect(rows[2]).toBe('(ii)At the time of execution of agreement 6,85,720/-')
    expect(rows[rows.length - 1]).toBe(`Total:${rs(total)} (${amountWords(total)} Only)`)
    expect(rows.slice(1, -1).join('')).not.toContain('17,50,000/-6,85,720')
  })

  it('lays out a custom plan and joint allottees in the same table and paragraph styles', async () => {
    const custom: ScheduleSource[] = [
      { code: 'AGREEMENT', label: 'At the time of execution of the Agreement', amountPaise: 300000000n },
      { code: null, label: 'Second payment', date: '2027-04-01', amountPaise: 300000000n },
      { code: 'HANDOVER', label: 'At the time of Handover/ Registry of flat', amountPaise: 300000000n },
    ]
    const base = sampleInput()
    const docx = await buildAgreementDocx(sampleInput({
      schedule: scheduleCLines(custom, 50000000n).lines,
      parties: [
        base.parties[0],
        { salutation: 'Mr.', name: 'Rohan Kapoor', relationship: 'Father', relativeName: 'Arjun Kapoor', occupation: 'Business', aadhaar: '222233334444', pan: 'BCDEF2345G', mobile: '8888888888', addressLines: ['14 Circular Road', 'Ranchi, Jharkhand-834001'] },
      ],
    }))
    const { xml } = readDocumentXml(docx)
    const text = paragraphsOf(docx).join('\n')
    const table = (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []).find((item) => rawText(item).includes('Milestone')) || ''
    const rows = (table.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map(rawText)
    expect(rows).toEqual([
      'Sr. No.MilestoneAmount',
      '(i)At the time of Booking5,00,000/-',
      '(ii)At the time of execution of agreement 25,00,000/-',
      '(iii)Second payment (01.04.2027)30,00,000/-',
      expect.stringMatching(/^\(iv\)At the time of handing over of\s+Apartment30,00,000\/-$/),
      'Total:Rs.90,00,000/- (Rupees Ninety Lakhs Only)',
    ])
    expect(text).toContain('Jharkhand-834001 and Mr. Rohan Kapoor (UID Number  222233334444 PAN BCDEF2345G and Mobile Number 8888888888) son of Mr. Arjun Kapoor , by occupation Business , presently residing at  14 Circular Road, Ranchi, Jharkhand-834001 are  Indian Citizen')
    expect(text).toContain('Mrs. Meera Kapoor and Mr. Rohan Kapoor')
  })
})

describe('agreement readiness', () => {
  const booking = {
    unit_no: '401',
    floor_no: '4',
    project_name: 'Anandam',
    agreement_for_sale_date: '2026-11-01',
    allotment_date: '2026-11-10',
    applicant_salutation: 'Ms.',
    applicant_name: 'Aisha Rahman',
    applicant_father_or_spouse: 'Imtiaz Rahman',
    applicant_address_line1: 'Flat 12B, Harmony Residency',
    applicant_city: 'Ranchi',
    applicant_state: 'Jharkhand',
    applicant_pin_code: '834008',
    builtup_area: 1387.1,
    super_builtup_area: 1803,
    total_property_value: 9015000,
    booking_amount_paid: 200000,
    payment_mode: 'Cheque',
    txn_or_cheque_no: '778899',
    txn_date: '2026-11-10',
    additional_parking: 1,
    premium_parking: 0,
  }
  const schedule = [
    { trigger_type: 'milestone', label: '20% at the time of execution of the Agreement', calculated_amount: 1803000 },
    { trigger_type: 'milestone', label: '80% at the time of Handover/ Registry of flat', calculated_amount: 7212000 },
  ]

  it('uses the single booking payment of an older booking and never counts expected bank money', () => {
    const older = agreementReadiness(booking, { schedule })
    expect(older.issues).toEqual([])
    expect(older.input?.bookingPaidPaise).toBe(20000000n)
    expect(older.input?.parties[0].addressLines).toEqual(['Flat 12B, Harmony Residency', 'Ranchi, Jharkhand-834008'])
    expect(older.input?.schedule[0]).toMatchObject({ code: 'BOOKING', amountPaise: 20000000n })
    expect(older.warnings.join(' ')).toContain('relationship')

    const financed = agreementReadiness(booking, {
      schedule,
      payments: [
        { payer_kind: 'applicant', amount: 901500, payment_mode: 'Cheque', reference_no: '1', payment_date: '2026-11-01', originating_bank: 'SBI', status: 'received' },
        { payer_kind: 'bank', amount: 901500, payment_mode: 'NEFT_RTGS', status: 'expected' },
      ],
    })
    expect(financed.input?.bookingPaidPaise).toBe(90150000n)
    expect(financed.input?.payments).toHaveLength(1)
  })

  it('reads the funding scenario, the bank and the loan status from the booking', () => {
    expect(agreementReadiness(booking, { schedule }).input?.finance).toEqual({ scenario: 'purchaser', bankName: '', loanSanctioned: null })
    const proposed = agreementReadiness({ ...booking, finance_scenario: 'split_10_90', finance_bank_name: 'HDFC Bank', finance_loan_status: 'Not yet sanctioned' }, { schedule })
    expect(proposed.input?.finance).toEqual({ scenario: 'split_10_90', bankName: 'HDFC Bank', loanSanctioned: false })
    const sanctioned = agreementReadiness({ ...booking, finance_scenario: 'split_50_50', finance_loan_status: 'Sanctioned' }, { schedule })
    expect(sanctioned.input?.finance.loanSanctioned).toBe(true)
    expect(sanctioned.warnings.join(' ')).toContain('financing bank is not entered')
    // The built-up area is printed as entered, never rounded.
    expect(sanctioned.input?.builtUp).toBe('1387.1')
    // A cheque on an older booking takes its bank from the payment details box.
    expect(agreementReadiness({ ...booking, payment_mode_detail: 'Bank of India' }, { schedule }).input?.payments[0].bank).toBe('Bank of India')
  })

  it('takes the received booking amount out of an instalment labelled At agreement', () => {
    const ready = agreementReadiness({
      ...booking,
      unit_no: '601',
      floor_no: '6',
      total_property_value: 12178600,
      booking_amount_paid: 1750000,
    }, {
      schedule: [
        { trigger_type: 'milestone', label: 'At agreement', calculated_amount: 2435720 },
        { trigger_type: 'date', label: 'Interim payment', milestone_date: '2026-09-15', calculated_amount: 3653580 },
        { trigger_type: 'milestone', label: 'At handover', calculated_amount: 6089300 },
      ],
      payments: [
        { payer_kind: 'applicant', amount: 1500000, payment_mode: 'Cheque', reference_no: 'CHQ-77821', payment_date: '2026-04-21', originating_bank: 'Indian Bank', status: 'received' },
        { payer_kind: 'coapplicant', amount: 250000, payment_mode: 'UPI', reference_no: 'UPI-19', payment_date: '2026-04-22', status: 'received' },
      ],
    })
    expect(ready.issues).toEqual([])
    expect(ready.warnings.join(' ')).not.toContain('Schedule C has no separate')
    expect(ready.input?.schedule.map((line) => [line.code, line.amountPaise])).toEqual([
      ['BOOKING', 175000000n],
      ['AGREEMENT', 68572000n],
      [null, 365358000n],
      [null, 608930000n],
    ])
    const total = ready.input?.schedule.reduce((sum, line) => sum + line.amountPaise, 0n)
    expect(total).toBe(ready.input?.considerationPaise)
    expect(total).toBe(1217860000n)
  })

  it('uses the same agreement for a landowner flat', () => {
    const ready = agreementReadiness({ ...booking, unit_no: '702', floor_no: '7' }, { schedule })
    expect(ready.issues.filter((issue) => /landowner/i.test(issue))).toEqual([])
    expect(ready.input?.unitNo).toBe('702')
  })
})
