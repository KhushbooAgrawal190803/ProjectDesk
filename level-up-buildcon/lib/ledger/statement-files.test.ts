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
    // Rows 5–7 are the payments (after title, subtitle, blank and header).
    expect(rowXml(5)).not.toMatch(/s="(7|8|9|10)"/)
    expect(rowXml(6).match(/s="(\d+)"/g)!.every((style) => ['s="7"', 's="8"', 's="9"'].includes(style))).toBe(true)
    expect(rowXml(7)).toContain('<c r="I7" s="10"><v>66120</v></c>')
    expect(rowXml(7)).toContain('<c r="H7" s="6"><v>1322400</v></c>')
    expect(sheet).toContain('<f>SUM(J5:J7)</f><v>1913520</v>')
    expect(sheet).toContain('Mrs. A &amp; Co &lt;test&gt;')
    expect(zip.file('xl/styles.xml')!.asText()).toContain('FFFEE2E2')
  })
  it('builds a PDF', () => {
    const pdf = buildStatementPdf(statement, meta)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
