import { describe, expect, it } from 'vitest'
import PizZip from 'pizzip'
import type { Statement, StatementRow } from './statement'
import { buildStatementXlsx } from './statement-xlsx'
import { buildStatementPdf } from './statement-pdf'

const L = (rupees: number) => BigInt(Math.round(rupees * 100))
const row = (key: string, principal: number, gst: number): StatementRow => ({
  key, bookingId: 'b', date: '2026-08-05', party: 'Mrs. A & Co <test>', mode: 'Cheque', reference: key, bank: 'SBI', flat: '506', serial: 'LUBC 03',
  principalPaise: L(principal), gstPaise: L(gst), totalPaise: L(principal + gst),
})
const statement: Statement = {
  owner: 'DEVELOPER',
  rows: [row('plain', 500000, 0), row('gstonly', 0, 25000), row('mixed', 1322400, 66120)],
  principalPaise: L(1822400), gstPaise: L(91120), totalPaise: L(1913520), payments: 3,
}
const meta = { company: 'Level Up Buildcon', period: '01.04.2026 to 26.11.2026' }

describe('cash statement files', () => {
  it('builds an Excel sheet where a GST-only payment is a red row and mixed GST is a red cell', () => {
    const zip = new PizZip(buildStatementXlsx(statement, meta))
    const sheet = zip.file('xl/worksheets/sheet1.xml')!.asText()
    const rowXml = (r: number) => sheet.match(new RegExp(`<row r="${r}">(.*?)</row>`))![1]
    // Rows 5–7 are the payments (after title, subtitle, blank and header). Styles: 6–7 red text/date, 9 money,
    // 10 red money (red row), 11 red GST figure, 12/13 totals.
    const styles = (r: number) => (rowXml(r).match(/s="(\d+)"/g) || []).map((style) => Number(style.slice(3, -1)))
    expect(styles(5).some((style) => [6, 7, 10, 11].includes(style))).toBe(false)
    expect(styles(6).every((style) => [6, 7, 10].includes(style))).toBe(true)
    expect(rowXml(7)).toContain('<c r="I7" s="11" t="inlineStr"><is><t xml:space="preserve">66,120.00</t></is></c>')
    // Amounts read in Indian grouping in every spreadsheet app, including Apple Numbers.
    expect(rowXml(7)).toContain('<t xml:space="preserve">13,22,400.00</t>')
    expect(sheet).toContain('<t xml:space="preserve">19,13,520.00</t>')
    expect(sheet).toContain('Mrs. A &amp; Co &lt;test&gt;')
    expect(zip.file('xl/styles.xml')!.asText()).toContain('FFFEE2E2')
  })
  it('builds a PDF', () => {
    const pdf = buildStatementPdf(statement, meta)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
