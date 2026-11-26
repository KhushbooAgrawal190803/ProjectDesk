import PizZip from 'pizzip'
import { formatInr } from '@/lib/booking/money'
import type { Statement, StatementRow } from './statement'

/**
 * The cash statement as an Excel workbook (.xlsx), written directly as the
 * Office XML parts. Amounts read 12,34,567.00 in every spreadsheet app, and
 * dates are real dates, so the sheet sorts by date. A payment
 * that is only GST is a red row; in a payment that includes GST, the GST cell is red.
 */

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Days since 1899-12-30, Excel's date serial. */
function excelDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000
}

function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

// Cell styles (indexes into cellXfs below).
const S = {
  text: 0,
  title: 1,
  subtitle: 2,
  header: 3,
  headerRight: 4,
  date: 5,
  redText: 6,
  redDate: 7,
  totalLabel: 8,
} as const

/**
 * Amounts are written already formatted in Indian grouping (8,90,000.00) and
 * right-aligned. No spreadsheet number format shows Indian grouping everywhere:
 * Excel can, but Apple Numbers misplaces the commas whatever the format, so the
 * figures are stored as text, exactly as the PDF prints them. The totals row is
 * calculated here, to the paisa, from the same figures.
 */
const MONEY_KINDS = {
  money: '',
  redMoney: 'fontId="4" fillId="3" applyFont="1" applyFill="1"',
  moneyRedFont: 'fontId="4" applyFont="1"',
  totalMoney: 'fontId="3" borderId="1" applyFont="1" applyBorder="1"',
  totalRedMoney: 'fontId="4" borderId="1" applyFont="1" applyBorder="1"',
} as const
type MoneyKind = keyof typeof MONEY_KINDS
const MONEY_KIND_NAMES = Object.keys(MONEY_KINDS) as MoneyKind[]
const FIRST_MONEY_STYLE = 9

function moneyStyle(kind: MoneyKind): number {
  return FIRST_MONEY_STYLE + MONEY_KIND_NAMES.indexOf(kind)
}

const MONEY_XFS = MONEY_KIND_NAMES.map((kind) => `<xf ${MONEY_KINDS[kind]} applyAlignment="1"><alignment horizontal="right"/></xf>`)

/** 8,90,000.00: Indian grouping, two decimals, no rupee sign. */
const indian = (paise: bigint) => formatInr(paise).replace('₹', '')

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="165" formatCode="dd\\.mm\\.yyyy"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF71717A"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="11"/><color rgb="FFB91C1C"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF4F4F5"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2"><border/><border><top style="thin"><color rgb="FF52525B"/></top></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="${FIRST_MONEY_STYLE + MONEY_XFS.length}">
<xf/>
<xf fontId="1" applyFont="1"/>
<xf fontId="2" applyFont="1"/>
<xf fontId="3" fillId="2" applyFont="1" applyFill="1"/>
<xf fontId="3" fillId="2" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="165" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf fontId="4" fillId="3" applyFont="1" applyFill="1"/>
<xf numFmtId="165" fontId="4" fillId="3" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf fontId="3" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
${MONEY_XFS.join('\n')}
</cellXfs>
</styleSheet>`

type Cell = { value: string | number | null; style: number; kind?: 'text' | 'number' }

function cellXml(ref: string, cell: Cell): string {
  if (cell.value == null || cell.value === '') return `<c r="${ref}" s="${cell.style}"/>`
  if (typeof cell.value === 'number') return `<c r="${ref}" s="${cell.style}"><v>${cell.value}</v></c>`
  return `<c r="${ref}" s="${cell.style}" t="inlineStr"><is><t xml:space="preserve">${escape(cell.value)}</t></is></c>`
}

const HEADERS = ['S.No.', 'Date', 'Party', 'Mode', 'Cheque / UTR No.', 'Bank', 'Flat', 'Serial', 'Amount (Rs.)', 'GST (Rs.)', 'Total (Rs.)']
const WIDTHS = [7, 12, 30, 13, 30, 22, 7, 11, 16, 14, 16]

function dataRow(row: StatementRow, index: number): Cell[] {
  const gstOnly = row.principalPaise === 0n && row.gstPaise > 0n
  const text = gstOnly ? S.redText : S.text
  const moneyKind: MoneyKind = gstOnly ? 'redMoney' : 'money'
  const amount = (paise: bigint, kind: MoneyKind): Cell => ({ value: paise > 0n ? indian(paise) : null, style: moneyStyle(kind) })
  return [
    { value: index + 1, style: gstOnly ? S.redText : S.text },
    { value: excelDate(row.date), style: gstOnly ? S.redDate : S.date },
    { value: row.party, style: text },
    { value: row.mode, style: text },
    { value: row.reference || '', style: text },
    { value: row.bank || '', style: text },
    { value: row.flat, style: text },
    { value: row.serial || '', style: text },
    amount(row.principalPaise, moneyKind),
    amount(row.gstPaise, gstOnly ? 'redMoney' : row.gstPaise > 0n ? 'moneyRedFont' : 'money'),
    { value: indian(row.totalPaise), style: moneyStyle(moneyKind) },
  ]
}

export function buildStatementXlsx(statement: Statement, meta: { company: string; period: string }): Buffer {
  const rows: Cell[][] = [
    [{ value: `${meta.company} — Cash Statement`, style: S.title }],
    [{ value: `${meta.period} · ${statement.payments} payment${statement.payments === 1 ? '' : 's'} received · GST in red`, style: S.subtitle }],
    [],
    HEADERS.map((header, index) => ({ value: header, style: index >= 8 ? S.headerRight : S.header })),
    ...statement.rows.map((row, index) => dataRow(row, index)),
    [],
  ]
  const totalRow = rows.length + 1
  const sheetRows = rows.map((cells, index) => {
    const r = index + 1
    return `<row r="${r}">${cells.map((cell, column) => cellXml(`${columnName(column)}${r}`, cell)).join('')}</row>`
  })
  const totals: Cell[] = [
    ...Array.from({ length: 7 }, () => ({ value: null, style: S.totalLabel })),
    { value: 'Total', style: S.totalLabel },
    { value: indian(statement.principalPaise), style: moneyStyle('totalMoney') },
    { value: indian(statement.gstPaise), style: moneyStyle('totalRedMoney') },
    { value: indian(statement.totalPaise), style: moneyStyle('totalMoney') },
  ]
  sheetRows.push(`<row r="${totalRow}">${totals.map((cell, column) => cellXml(`${columnName(column)}${totalRow}`, cell)).join('')}</row>`)

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${WIDTHS.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>
<sheetData>${sheetRows.join('')}</sheetData>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`

  const sheetName = escape(meta.company.slice(0, 31))
  const zip = new PizZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`)
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)
  zip.file('xl/styles.xml', STYLES)
  zip.file('xl/worksheets/sheet1.xml', sheet)
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer
}
