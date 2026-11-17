/**
 * Blank booking form. Only fields a person types into the booking screen.
 * The register fills project details, areas, boundaries, GST, and the
 * standard slab amounts, so those are not on this form.
 *
 *   npx tsx scripts/booking-paper-form.ts
 */
import { writeFileSync } from 'node:fs'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

const PAGE_W = 595.28
const PAGE_H = 841.89
const M = 40
const CONTENT_W = PAGE_W - M * 2
const BOTTOM = 40
const GUTTER = 18
const WRITE = 16
const AFTER = 14

const INK = rgb(0.12, 0.13, 0.15)
const MUTED = rgb(0.38, 0.4, 0.43)
const RULE = rgb(0.22, 0.24, 0.27)
const HAIR = rgb(0.78, 0.79, 0.81)
const BAND = rgb(0.945, 0.948, 0.952)

class Form {
  doc!: PDFDocument
  regular!: PDFFont
  bold!: PDFFont
  page!: PDFPage
  y = 0
  pages: PDFPage[] = []

  async init() {
    this.doc = await PDFDocument.create()
    this.regular = await this.doc.embedFont(StandardFonts.Helvetica)
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold)
    this.addPage(true)
  }

  addPage(first = false) {
    this.page = this.doc.addPage([PAGE_W, PAGE_H])
    this.pages.push(this.page)
    this.y = PAGE_H - 32
    this.page.drawText('LEVEL UP BUILDCON', { x: M, y: this.y, size: 8, font: this.bold, color: INK })
    const right = 'ANANDAM'
    const rightW = this.bold.widthOfTextAtSize(right, 8)
    this.page.drawText(right, { x: PAGE_W - M - rightW, y: this.y, size: 8, font: this.bold, color: INK })
    this.y -= 6
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: PAGE_W - M, y: this.y }, thickness: 0.8, color: INK })
    this.y -= first ? 22 : 18
  }

  need(height: number) {
    if (this.y - height < BOTTOM) this.addPage()
  }

  gap(n: number) {
    this.y -= n
  }

  text(value: string, size: number, font: PDFFont, color: ReturnType<typeof rgb>, x = M) {
    this.page.drawText(value, { x, y: this.y, size, font, color })
  }

  wrap(value: string, size: number, font: PDFFont, color: ReturnType<typeof rgb>, width: number, leading: number, x = M) {
    const words = value.split(' ')
    let line = ''
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) > width) {
        this.page.drawText(line, { x, y: this.y, size, font, color })
        this.y -= leading
        line = word
      } else {
        line = next
      }
    }
    if (line) {
      this.page.drawText(line, { x, y: this.y, size, font, color })
      this.y -= leading
    }
  }

  section(title: string) {
    const barH = 16
    this.need(barH + 16)
    this.y -= 8
    const bottom = this.y - barH
    this.page.drawRectangle({ x: M, y: bottom, width: CONTENT_W, height: barH, color: BAND })
    this.page.drawText(title.toUpperCase(), { x: M + 8, y: bottom + 4, size: 8, font: this.bold, color: INK })
    this.y = bottom - 10
  }

  note(value: string) {
    this.need(14)
    this.wrap(value, 8, this.regular, MUTED, CONTENT_W, 11)
    this.gap(4)
  }

  /** One row of boxed fields. Every box in the row shares the same top and bottom. */
  fields(items: Array<{ label: string; flex?: number }>, height = 34) {
    const gapBelow = 12
    this.need(height + gapBelow)
    const flexes = items.map((item) => item.flex ?? 1)
    const total = flexes.reduce((sum, n) => sum + n, 0)
    const usable = CONTENT_W - GUTTER * (items.length - 1)
    let x = M
    const bottom = this.y - height
    for (let i = 0; i < items.length; i++) {
      const width = (usable * flexes[i]) / total
      this.page.drawRectangle({
        x,
        y: bottom,
        width,
        height,
        borderColor: RULE,
        borderWidth: 0.6,
      })
      this.page.drawText(items[i].label, { x: x + 6, y: this.y - 11, size: 7.5, font: this.regular, color: MUTED })
      x += width + GUTTER
    }
    this.y = bottom - gapBelow
  }

  checks(label: string, options: string[]) {
    const rowH = 16
    this.need(rowH + 6)
    let x = M
    const labelW = this.regular.widthOfTextAtSize(label, 8)
    this.page.drawText(label, { x, y: this.y, size: 8, font: this.regular, color: MUTED })
    x += labelW + 12
    const box = 8
    for (const option of options) {
      const optionW = this.regular.widthOfTextAtSize(option, 9)
      const needW = box + 6 + optionW + 14
      if (x + needW > PAGE_W - M) {
        this.y -= rowH + 4
        x = M + labelW + 12
      }
      this.page.drawRectangle({ x, y: this.y - 1, width: box, height: box, borderColor: RULE, borderWidth: 0.7 })
      this.page.drawText(option, { x: x + box + 6, y: this.y, size: 9, font: this.regular, color: INK })
      x += needW
    }
    this.y -= rowH + 8
  }

  choice(n: string, line: string) {
    this.need(18)
    this.page.drawRectangle({ x: M, y: this.y - 1, width: 8, height: 8, borderColor: RULE, borderWidth: 0.7 })
    this.page.drawText(n, { x: M + 16, y: this.y, size: 9, font: this.bold, color: INK })
    this.page.drawText(line, { x: M + 30, y: this.y, size: 9, font: this.regular, color: INK })
    this.y -= 18
  }
}

function person(form: Form, title: string) {
  form.need(440)
  form.section(title)
  form.checks('Salutation', ['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.'])
  form.fields([{ label: 'Full name' }])
  form.fields([{ label: "Parents' or spouse's name" }])
  form.checks('Relationship', ['Father', 'Mother', 'Husband', 'Wife'])
  form.fields([{ label: 'Occupation' }])
  form.fields([{ label: 'Mobile', flex: 1 }, { label: 'Email', flex: 1.7 }])
  form.fields([{ label: 'PAN', flex: 1 }, { label: 'Aadhaar', flex: 1.2 }])
  form.fields([{ label: 'Address line 1' }])
  form.fields([{ label: 'Address line 2' }])
  form.fields([
    { label: 'City', flex: 1.4 },
    { label: 'State', flex: 1.3 },
    { label: 'PIN', flex: 0.7 },
  ])
}

function drawTable(
  form: Form,
  columns: Array<{ label: string; width: number }>,
  rows: number,
  rowH: number
) {
  const headH = 18
  form.need(headH + rows * rowH + 2)
  const top = form.y
  form.page.drawRectangle({ x: M, y: form.y - headH, width: CONTENT_W, height: headH, color: BAND })
  let x = M
  for (const column of columns) {
    if (column.label) {
      form.page.drawText(column.label, { x: x + 5, y: form.y - 12, size: 7.5, font: form.bold, color: INK })
    }
    x += column.width
  }
  form.y -= headH
  for (let row = 0; row < rows; row++) {
    const bottom = form.y - rowH
    if (row % 2 === 1) {
      form.page.drawRectangle({ x: M, y: bottom, width: CONTENT_W, height: rowH, color: rgb(0.985, 0.986, 0.988) })
    }
    form.page.drawText(String(row + 1), {
      x: M + (columns[0].width - form.regular.widthOfTextAtSize(String(row + 1), 8)) / 2,
      y: bottom + rowH / 2 - 3,
      size: 8,
      font: form.regular,
      color: MUTED,
    })
    let cx = M
    for (const column of columns) {
      form.page.drawLine({
        start: { x: cx, y: bottom },
        end: { x: cx, y: bottom + rowH },
        thickness: 0.35,
        color: HAIR,
      })
      cx += column.width
    }
    form.page.drawLine({ start: { x: M, y: bottom }, end: { x: PAGE_W - M, y: bottom }, thickness: 0.35, color: HAIR })
    form.y = bottom
  }
  form.page.drawRectangle({
    x: M,
    y: form.y,
    width: CONTENT_W,
    height: top - form.y,
    borderColor: RULE,
    borderWidth: 0.7,
  })
}

async function main() {
  const form = new Form()
  await form.init()

  form.text('Booking form', 18, form.bold, INK)
  form.y -= 16
  form.wrap(
    'Write only what will be typed into the booking. Flat areas, boundaries, GST, and the standard payment slabs are filled by the register.',
    8.5,
    form.regular,
    MUTED,
    CONTENT_W,
    11
  )
  form.gap(8)

  form.section('Flat')
  form.fields([
    { label: 'Flat number', flex: 0.8 },
    { label: 'Allotment date', flex: 1.1 },
    { label: 'Agreement for sale date', flex: 1.3 },
  ])

  person(form, 'Primary applicant')

  form.need(760)
  person(form, 'Co-applicant 1')
  form.note('Leave this section blank when there is no co-applicant.')
  person(form, 'Co-applicant 2')
  form.note('Leave this section blank when there is no second co-applicant. Add a further copy of this section for a third.')

  form.addPage()
  form.text('Price and payment', 16, form.bold, INK)
  form.y -= 18

  form.section('Flat price')
  form.note('Tick one. If the price is per sq.ft., write the rate and leave the lump sum blank. The flat price is then calculated from the super built-up area.')
  form.checks('Price basis', ['Rate per sq.ft.', 'Lump sum'])
  form.fields([
    { label: 'Rate per sq.ft. (Rs.)', flex: 1 },
    { label: 'Lump-sum flat price (Rs.)', flex: 1.2 },
  ])

  form.section('Parking')
  form.note('Write the number of spaces and the price of each space. The parking total is calculated.')
  form.fields([
    { label: 'Main parking, number of spaces', flex: 1.2 },
    { label: 'Price of each main space (Rs.)', flex: 1.2 },
  ])
  form.fields([
    { label: 'Secondary parking, number of spaces', flex: 1.2 },
    { label: 'Price of each secondary space (Rs.)', flex: 1.2 },
  ])

  form.section('Who pays the instalments')
  form.note('Tick one.')
  form.choice('1', 'Purchaser pays the booking instalment.')
  form.choice('2', 'Bank shares the booking instalment only. Purchaser pays 10% of Total Consideration.')
  form.choice('3', 'Purchaser pays 10% and the bank pays 90% of every instalment.')
  form.gap(4)

  form.section('Bank')
  form.note('Complete only when a bank is paying. Leave the section blank for a purchaser-funded booking.')
  form.fields([{ label: 'Bank name', flex: 1.4 }, { label: 'Branch', flex: 1 }])
  form.fields([{ label: 'Bank address' }])
  form.checks('Loan status', ['Proposed', 'Applied', 'Sanctioned', 'Partly disbursed', 'Fully disbursed'])
  form.fields([
    { label: 'Sanction number', flex: 1.2 },
    { label: 'Sanction date', flex: 1 },
    { label: 'Sanction amount (Rs.)', flex: 1.2 },
  ])
  form.fields([
    { label: 'Expected bank payment for the booking instalment (Rs.)', flex: 1.7 },
    { label: 'Expected date', flex: 0.8 },
  ])

  form.need(150)
  form.section('Bank NOC')
  form.note('Complete only when a NOC letter is required.')
  form.checks('NOC required', ['No', 'Yes'])
  form.fields([
    { label: 'NOC bank name', flex: 1 },
    { label: 'Addressee', flex: 1.3 },
  ])
  form.fields([{ label: 'NOC bank address' }])

  form.gap(18)
  form.need(360)
  form.text('Payments received', 16, form.bold, INK)
  form.y -= 16
  form.note('One row for each payment already in hand. Do not enter expected bank money here.')
  form.note('Mode: Cash, Cheque, NEFT / RTGS, UPI, or Other. Status: Received, Pending clearance, or Failed / Returned.')
  form.gap(4)

  const pay = [
    { label: '', width: 20 },
    { label: 'Date', width: 50 },
    { label: 'Paid by', width: 82 },
    { label: 'Amount (Rs.)', width: 64 },
    { label: 'GST (Rs.)', width: 50 },
    { label: 'Mode', width: 48 },
    { label: 'Cheque no. / UTR', width: 72 },
    { label: 'Bank', width: 62 },
    { label: 'Status', width: 0 },
  ]
  const used = pay.reduce((sum, column) => sum + column.width, 0)
  pay[pay.length - 1].width = CONTENT_W - used
  drawTable(form, pay, 7, 36)

  form.gap(16)
  form.need(300)
  form.section('Custom payment slabs')
  form.note('Leave this blank when the booking uses the standard schedule. The register already has those fourteen slabs and calculates each amount.')
  form.note('For a custom schedule, write each payment on its own row. Value is the percentage, or the fixed rupee amount.')
  form.gap(2)
  const custom = [
    { label: 'No.', width: 28 },
    { label: 'Slab or date', width: 250 },
    { label: '% or fixed', width: 80 },
    { label: 'Value', width: 0 },
  ]
  custom[custom.length - 1].width = CONTENT_W - custom.reduce((sum, column) => sum + column.width, 0)
  const slabRowH = 34
  const slabHeadH = 18
  const slabRows = Math.floor((form.y - BOTTOM - slabHeadH - 2) / slabRowH)
  drawTable(form, custom, slabRows, slabRowH)
  console.log(`custom slab rows ${slabRows}`)

  const total = form.pages.length
  form.pages.forEach((page, index) => {
    const label = `${index + 1}  /  ${total}`
    const w = form.regular.widthOfTextAtSize(label, 8)
    page.drawLine({ start: { x: M, y: 28 }, end: { x: PAGE_W - M, y: 28 }, thickness: 0.4, color: HAIR })
    page.drawText('Booking form', { x: M, y: 14, size: 8, font: form.regular, color: MUTED })
    page.drawText(label, { x: PAGE_W - M - w, y: 14, size: 8, font: form.regular, color: MUTED })
  })

  const bytes = await form.doc.save()
  const out = new URL('../Anandam-Booking-Information-Form.pdf', import.meta.url)
  writeFileSync(out, bytes)
  console.log(`pages ${form.pages.length}`)
  console.log(out.pathname)
}

main()
