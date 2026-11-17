import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildAgreementDocx } from '@/lib/documents/agreement'
import { agreementSamples } from '@/lib/documents/agreement-samples'
import { AgreementPdfError, agreementPdf } from '@/lib/documents/agreement-pdf'
import { rawText, readDocumentXml, splitParagraphs, writeDocumentXml } from '@/lib/documents/docx-fill'
import { formatAmountFigures } from '@/lib/documents/inr-words'
import { amountWords } from '@/lib/documents/agreement-wording'
import { compareLines, findOffice, isFooter, officePdf, readPdfText, type PdfText } from '@/lib/documents/docx-pdf/pdf-lines'

const samples = agreementSamples()
const rendered = new Map<string, Promise<{ docx: Buffer; pdf: Buffer; text: PdfText }>>()

function render(id: string) {
  let pending = rendered.get(id)
  if (!pending) {
    pending = (async () => {
      const sample = samples.find((item) => item.id === id)!
      const docx = await buildAgreementDocx(sample.input)
      const pdf = await agreementPdf(docx)
      return { docx, pdf, text: await readPdfText(pdf) }
    })()
    rendered.set(id, pending)
  }
  return pending
}

const compact = (value: string) => value.replace(/\s+/g, '')

/** A paragraph's text as Word shows it: runs formatted as capitals are printed in capitals. */
function shownText(paragraph: string): string {
  return (paragraph.match(/<w:r[ >][\s\S]*?<\/w:r>/g) || [])
    .map((run) => (/<w:caps\/>/.test(run) ? rawText(run).toUpperCase() : rawText(run)))
    .join('')
}

/** The Word file's body in order: each paragraph, or each table as its cell paragraphs. */
function wordBlocks(docx: Buffer): Array<{ table: boolean; texts: string[] }> {
  const body = readDocumentXml(docx).xml.split(/<w:body>/)[1]
  const blocks: Array<{ table: boolean; texts: string[] }> = []
  for (const match of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const texts = (match[0].startsWith('<w:tbl>') ? splitParagraphs(match[0]).parts : [match[0]]).map((part) => compact(shownText(part)))
    blocks.push({ table: match[0].startsWith('<w:tbl>'), texts: texts.filter(Boolean) })
  }
  return blocks.filter((block) => block.texts.length)
}

function isSubsequence(needle: string, haystack: string): boolean {
  let at = 0
  for (const character of haystack) if (at < needle.length && character === needle[at]) at += 1
  return at === needle.length
}

describe('Agreement for Sale PDF', () => {
  it.each(samples.map((sample) => [sample.id, sample.description]))('%s: carries every paragraph of the Word file, in order (%s)', async (id) => {
    const { docx, text } = await render(id)
    const body = text.lines.filter((line) => !isFooter(line)).map((line) => line.text).join('')
    const blocks = wordBlocks(docx)
    let cursor = 0
    blocks.forEach((block, index) => {
      if (!block.table) {
        // Each paragraph appears whole and after the one before it; only its clause number may precede it.
        const found = body.indexOf(block.texts[0], cursor)
        expect(found, `paragraph missing or out of order: ${block.texts[0].slice(0, 80)}`).toBeGreaterThanOrEqual(0)
        expect(body.slice(cursor, found)).toMatch(/^[0-9A-Za-z().]{0,8}$/)
        cursor = found + block.texts[0].length
        return
      }
      // A table is read row by row across its cells, so each cell is checked within the table's text.
      const next = blocks.slice(index + 1).find((item) => !item.table)
      const end = next ? body.indexOf(next.texts[0], cursor) : body.length
      const region = body.slice(cursor, end)
      for (const cell of block.texts) expect(isSubsequence(cell, region), `table cell missing: ${cell.slice(0, 60)}`).toBe(true)
      expect(region.length).toBeGreaterThanOrEqual(block.texts.join('').length)
      cursor = end
    })
    expect(body.length - cursor).toBe(0)
  })

  it.each(samples.map((sample) => [sample.id]))('%s: prints the booking details and the money exactly', async (id) => {
    const { text } = await render(id)
    const input = samples.find((sample) => sample.id === id)!.input
    const all = compact(text.lines.map((line) => line.text).join(''))
    const expectIn = (value: string) => expect(all, value).toContain(compact(value))
    for (const party of input.parties) {
      expectIn(`${party.salutation} ${party.name}`.toUpperCase())
      if (party.pan) expectIn(party.pan)
      if (party.aadhaar) expectIn(party.aadhaar)
      for (const line of party.addressLines) expectIn(line)
    }
    expectIn(`Flat No.${input.unitNo}`)
    expectIn(`Rs.${formatAmountFigures(input.considerationPaise)}/-`)
    expectIn(amountWords(input.considerationPaise))
    expectIn(`Rs. ${formatAmountFigures(input.gstPaise)}/-`)
    for (const line of input.schedule) expectIn(`${formatAmountFigures(line.amountPaise)}/-`)
    for (const payment of input.payments) expectIn(`Rs. ${formatAmountFigures(payment.amountPaise)}/-`)
    expectIn(`super built up area ${input.superBuiltUp}`)
    expectIn(`${input.landShare} sq. ft.`)
    if (input.finance.bankName) expectIn(input.finance.bankName)
  })

  it.each(samples.map((sample) => [sample.id]))('%s: numbers every page and keeps text inside the page', async (id) => {
    const { pdf, text } = await render(id)
    const doc = await PDFDocument.load(pdf)
    expect(doc.getPageCount()).toBe(text.pages)
    expect(text.pages).toBeGreaterThanOrEqual(30)
    const footers = text.lines.filter(isFooter)
    expect(footers.map((line) => line.text)).toEqual(Array.from({ length: text.pages }, (_, index) => `Page${index + 1}of${text.pages}`))
    // A4 with the master's margins. Text starts inside the left margin and stays on the
    // page; the master's tables are wider than the text and reach into the right margin.
    for (const item of text.items) {
      if (!item.text.trim()) continue
      expect(item.x).toBeGreaterThanOrEqual(82)
      expect(item.x + item.width).toBeLessThanOrEqual(text.width - 36)
      expect(item.y).toBeGreaterThan(72)
      expect(item.y).toBeLessThan(text.height - 36)
    }
    // No two lines on a page share a baseline band: nothing is printed over anything else.
    const body = text.lines.filter((line) => !isFooter(line))
    for (let index = 1; index < body.length; index += 1) {
      if (body[index].page === body[index - 1].page) expect(body[index].y - body[index - 1].y).toBeGreaterThan(6)
    }
  })

  it('keeps the signature page together on its own page', async () => {
    const { text } = await render('single-cheque')
    const last = text.lines.filter((line) => line.page === text.pages && !isFooter(line)).map((line) => line.text)
    expect(last[0]).toMatch(/^INWITNESSWHEREOF/)
    expect(last).toContain('WITNESSES:-')
    expect(last).toContain('1.Signature________________________')
    expect(last).toContain('2.Signature________________________')
    expect(last).toContain('ForLEVELUPBUILDCON')
    expect(last).toContain('ALLOTTEE(S)')
  })

  it('refuses a Word file with content it cannot set, instead of leaving it out', async () => {
    const { docx } = await render('single-cheque')
    const { zip, xml } = readDocumentXml(docx)
    const tracked = xml.replace('<w:body>', '<w:body><w:p><w:del w:id="1" w:author="x"><w:r><w:delText>gone</w:delText></w:r></w:del></w:p>')
    await expect(agreementPdf(writeDocumentXml(zip, tracked))).rejects.toThrow(AgreementPdfError)
  })

  it('refuses a name its fonts cannot print, instead of dropping the characters', async () => {
    const sample = samples[0]
    const docx = await buildAgreementDocx({ ...sample.input, parties: [{ ...sample.input.parties[0], name: 'मीरा कपूर' }] })
    await expect(agreementPdf(docx)).rejects.toThrow(/cannot be shown/)
  })

  it('sets a 35-page agreement quickly enough for a request', async () => {
    const { docx } = await render('three-long-custom')
    const started = Date.now()
    await agreementPdf(docx)
    expect(Date.now() - started).toBeLessThan(5000)
  })
})

describe('Agreement for Sale PDF against LibreOffice', async () => {
  const office = await findOffice()
  it.skipIf(!office).each(samples.map((sample) => [sample.id]))(
    '%s: same pages, line breaks and text as the office renderer',
    async (id) => {
      const { docx, text } = await render(id)
      const reference = await readPdfText(await officePdf(office!, docx))
      const result = compareLines(text, reference)
      expect(result.pages.pdf).toBe(result.pages.reference)
      expect(result.sameText).toBe(true)
      expect(result.differences).toEqual([])
      expect(result.sameLines).toBe(result.lines.reference)
      // Baselines agree except a few table rows, which may sit up to a few points apart.
      expect(result.samePlace / result.sameLines).toBeGreaterThan(0.9)
      expect(result.largestShift).toBeLessThan(4)
    },
    120_000
  )
})
