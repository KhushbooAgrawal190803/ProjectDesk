import { jsPDF } from 'jspdf'
import { formatInr } from '@/lib/booking/money'
import { formatLetterDate } from '@/lib/documents/inr-words'
import type { Statement } from './statement'

/**
 * The cash statement as an A4 landscape PDF. A payment that is only GST is a red
 * row; in a payment that includes GST, the GST figure is red. Amounts are in
 * Indian grouping without the rupee sign, which the PDF's built-in font lacks.
 */

const RED: [number, number, number] = [185, 28, 28]
const RED_FILL: [number, number, number] = [254, 226, 226]
const INK: [number, number, number] = [24, 24, 27]
const MUTED: [number, number, number] = [113, 113, 122]

const amount = (paise: bigint) => formatInr(paise).replace('₹', '')

const COLUMNS = [
  { title: 'Date', width: 20 },
  { title: 'Party', width: 44 },
  { title: 'Mode', width: 22 },
  { title: 'Cheque / UTR No.', width: 50 },
  { title: 'Bank', width: 30 },
  { title: 'Flat', width: 12 },
  { title: 'Amount (Rs.)', width: 32, right: true },
  { title: 'GST (Rs.)', width: 25, right: true },
  { title: 'Total (Rs.)', width: 32, right: true },
] as const

export function buildStatementPdf(statement: Statement, meta: { company: string; period: string }): Buffer {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const left = 10
  const tableWidth = COLUMNS.reduce((sum, column) => sum + column.width, 0)
  const lineHeight = 4
  let y = 0

  const cellX = (index: number) => left + COLUMNS.slice(0, index).reduce((sum, column) => sum + column.width, 0)
  const fit = (text: string, width: number) => doc.splitTextToSize(text, width - 3) as string[]

  const header = () => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setFillColor(244, 244, 245)
    doc.rect(left, y, tableWidth, 7, 'F')
    doc.setTextColor(...MUTED)
    COLUMNS.forEach((column, index) => {
      const x = 'right' in column && column.right ? cellX(index) + column.width - 1.5 : cellX(index) + 1.5
      doc.text(column.title.toUpperCase(), x, y + 4.6, { align: 'right' in column && column.right ? 'right' : 'left' })
    })
    y += 7
  }

  const titleBlock = (first: boolean) => {
    y = 14
    doc.setTextColor(...INK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(first ? 15 : 11)
    doc.text(`${meta.company} — Cash Statement`, left, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    y += first ? 6 : 5
    doc.text(`${meta.period} · ${statement.payments} payment${statement.payments === 1 ? '' : 's'} received · GST in red`, left, y)
    y += 5
    header()
  }

  titleBlock(true)

  if (!statement.rows.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text('No money was received in this period.', left, y + 8)
  }

  doc.setFontSize(8.5)
  statement.rows.forEach((row, rowIndex) => {
    const gstOnly = row.principalPaise === 0n && row.gstPaise > 0n
    const cells = [
      formatLetterDate(row.date) || row.date,
      row.party,
      row.mode,
      row.reference || '—',
      row.bank || '',
      row.flat || '—',
      row.principalPaise > 0n ? amount(row.principalPaise) : '—',
      row.gstPaise > 0n ? amount(row.gstPaise) : '—',
      amount(row.totalPaise),
    ]
    doc.setFont('helvetica', 'normal')
    const wrapped = cells.map((text, index) => fit(text, COLUMNS[index].width))
    const height = Math.max(...wrapped.map((lines) => lines.length)) * lineHeight + 2.6
    // Keep the total on the same page as the last payment.
    const reserve = rowIndex === statement.rows.length - 1 ? 10 : 0
    if (y + height + reserve > pageHeight - 18) {
      doc.addPage()
      titleBlock(false)
      doc.setFontSize(8.5)
    }
    if (gstOnly) {
      doc.setFillColor(...RED_FILL)
      doc.rect(left, y, tableWidth, height, 'F')
    }
    wrapped.forEach((lines, index) => {
      const column = COLUMNS[index]
      const isGstCell = index === 7 && row.gstPaise > 0n
      doc.setTextColor(...(gstOnly || isGstCell ? RED : INK))
      doc.setFont('helvetica', index === 8 || isGstCell ? 'bold' : 'normal')
      const right = 'right' in column && column.right
      const x = right ? cellX(index) + column.width - 1.5 : cellX(index) + 1.5
      doc.text(lines, x, y + 4.3, { align: right ? 'right' : 'left' })
    })
    y += height
    doc.setDrawColor(228, 228, 231)
    doc.setLineWidth(0.1)
    doc.line(left, y, left + tableWidth, y)
  })

  if (statement.rows.length) {
    if (y + 10 > pageHeight - 18) {
      doc.addPage()
      titleBlock(false)
    }
    doc.setDrawColor(82, 82, 91)
    doc.setLineWidth(0.4)
    doc.line(left, y + 0.5, left + tableWidth, y + 0.5)
    y += 5.5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...INK)
    doc.text('Total received', cellX(6) - 3, y, { align: 'right' })
    doc.text(amount(statement.principalPaise), cellX(6) + COLUMNS[6].width - 1.5, y, { align: 'right' })
    doc.setTextColor(...RED)
    doc.text(amount(statement.gstPaise), cellX(7) + COLUMNS[7].width - 1.5, y, { align: 'right' })
    doc.setTextColor(...INK)
    doc.text(amount(statement.totalPaise), cellX(8) + COLUMNS[8].width - 1.5, y, { align: 'right' })
  }

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(`${meta.company} · Cash Statement · ${meta.period}`, left, pageHeight - 8)
    doc.text(`Page ${page} of ${pages}`, pageWidth - left, pageHeight - 8, { align: 'right' })
  }

  return Buffer.from(doc.output('arraybuffer'))
}
