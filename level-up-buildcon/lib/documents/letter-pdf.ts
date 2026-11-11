import { readFile } from 'fs/promises'
import path from 'path'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { buildLetter, LetterNotReadyError, type LetterBlock, type LetterKind, type LetterSource } from '@/lib/documents/letter-model'

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN_X = 72
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2
const BOTTOM = 64
/** Cropped from the Word letterhead as printed: name, logo, address and divider. */
const LETTERHEAD_HEIGHT = 158
const BODY_SIZE = 12
const LEADING = 16
/** 50mm between "For LEVEL UP BUILDCON" and "Partner", for a stamp and signature. */
export const STAMP_GAP_PT = Math.round((50 * 72) / 25.4)

let letterheadBytes: Uint8Array | null = null

async function loadLetterhead(): Promise<Uint8Array> {
  if (letterheadBytes) return letterheadBytes
  const file = path.join(process.cwd(), 'assets/letterhead/letterhead.png')
  letterheadBytes = new Uint8Array(await readFile(file))
  return letterheadBytes
}

/** pdf-lib's built-in fonts reject characters outside Windows-1252, which was failing letter generation. */
function winAnsiSafe(value: string): string {
  return value
    .replace(/₹/g, 'Rs. ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[^\u0000-\u00FF]/g, '')
}

function wrapLine(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of winAnsiSafe(text).split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push('')
      continue
    }
    let current = ''
    const pushWord = (word: string) => {
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word
        return
      }
      let chunk = ''
      for (const character of word) {
        if (chunk && font.widthOfTextAtSize(chunk + character, size) > maxWidth) {
          lines.push(chunk)
          chunk = character
        } else {
          chunk += character
        }
      }
      current = chunk
    }
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) current = trial
      else {
        if (current) lines.push(current)
        pushWord(word)
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

function drawJustified(
  page: PDFPage,
  font: PDFFont,
  line: string,
  size: number,
  x: number,
  y: number,
  maxWidth: number,
  justify: boolean
) {
  const words = line.split(' ').filter(Boolean)
  if (!justify || words.length < 2) {
    page.drawText(line, { x, y, size, font, color: rgb(0, 0, 0) })
    return
  }
  const wordsWidth = words.reduce((sum, word) => sum + font.widthOfTextAtSize(word, size), 0)
  const gap = (maxWidth - wordsWidth) / (words.length - 1)
  let cursor = x
  for (const word of words) {
    page.drawText(word, { x: cursor, y, size, font, color: rgb(0, 0, 0) })
    cursor += font.widthOfTextAtSize(word, size) + gap
  }
}

export async function renderLetterPdf(blocks: LetterBlock[]): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.TimesRoman)
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const letterhead = await pdf.embedPng(await loadLetterhead())

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const paintLetterhead = () => {
    page.drawImage(letterhead, { x: 0, y: PAGE_HEIGHT - LETTERHEAD_HEIGHT, width: PAGE_WIDTH, height: LETTERHEAD_HEIGHT })
  }
  paintLetterhead()
  let y = PAGE_HEIGHT - LETTERHEAD_HEIGHT - 18

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    paintLetterhead()
    y = PAGE_HEIGHT - LETTERHEAD_HEIGHT - 18
  }

  const ensure = (height: number) => {
    if (y - height < BOTTOM) newPage()
  }

  const drawLines = (lines: string[], font: PDFFont, justify: boolean, gapAfter: number) => {
    let index = 0
    while (index < lines.length) {
      const room = Math.floor((y - BOTTOM) / LEADING)
      if (room < 1) {
        newPage()
        continue
      }
      let take = Math.min(room, lines.length - index)
      const leftAfter = lines.length - index - take
      if (leftAfter === 1 && take > 1) take -= 1
      if (leftAfter === 1 && take === 1) {
        newPage()
        continue
      }
      const chunkEnd = index + take
      for (let i = index; i < chunkEnd; i += 1) {
        const isLast = i === lines.length - 1
        drawJustified(page, font, lines[i], BODY_SIZE, MARGIN_X, y, CONTENT_WIDTH, justify && !isLast && lines[i].length > 40)
        y -= LEADING
      }
      index = chunkEnd
    }
    y -= gapAfter
  }

  for (const block of blocks) {
    if (block.kind === 'line') {
      const font = block.bold ? bold : regular
      const lines = wrapLine(font, block.text, BODY_SIZE, CONTENT_WIDTH)
      lines.forEach((line) => {
        ensure(LEADING)
        const width = font.widthOfTextAtSize(line, BODY_SIZE)
        const x = block.center ? (PAGE_WIDTH - width) / 2 : MARGIN_X
        page.drawText(line, { x, y, size: BODY_SIZE, font, color: rgb(0, 0, 0) })
        y -= LEADING
      })
      y -= block.gapAfter ?? 4
      continue
    }

    if (block.kind === 'paragraph') {
      const lines = wrapLine(regular, block.text, BODY_SIZE, CONTENT_WIDTH)
      drawLines(lines, regular, true, block.gapAfter ?? 12)
      continue
    }

    if (block.kind === 'table') {
      const labelWidth = 110
      for (const row of block.rows) {
        const valueLines = wrapLine(regular, row.value, BODY_SIZE, CONTENT_WIDTH - labelWidth)
        const height = Math.max(1, valueLines.length) * LEADING
        ensure(height)
        page.drawText(row.label, { x: MARGIN_X, y, size: BODY_SIZE, font: bold, color: rgb(0, 0, 0) })
        valueLines.forEach((line, index) => {
          page.drawText(line, { x: MARGIN_X + labelWidth, y: y - index * LEADING, size: BODY_SIZE, font: regular, color: rgb(0, 0, 0) })
        })
        y -= height
      }
      y -= 12
      continue
    }

    if (block.kind === 'grid') {
      const fontSize = 10
      const gridLeading = 13
      const pad = 4
      const headerLines = block.columns.map((column) => wrapLine(bold, column.header, fontSize, column.width - pad * 2))
      const bodyLines = block.rows.map((row) =>
        row.map((cell, index) => wrapLine(regular, cell, fontSize, block.columns[index].width - pad * 2))
      )
      const heightFor = (lines: string[][]) => Math.max(...lines.map((line) => Math.max(1, line.length))) * gridLeading + pad * 2
      const heights = [heightFor(headerLines), ...bodyLines.map((lines) => heightFor(lines))]
      ensure(heights.reduce((sum, height) => sum + height, 0))
      const paintRow = (lines: string[][], height: number, header: boolean, emphasize: boolean) => {
        page.drawRectangle({
          x: MARGIN_X,
          y: y - height,
          width: CONTENT_WIDTH,
          height,
          color: rgb(1, 1, 1),
          borderColor: rgb(0, 0, 0),
          borderWidth: 0.4,
        })
        let x = MARGIN_X
        lines.forEach((cell, index) => {
          const column = block.columns[index]
          if (index > 0) {
            page.drawLine({
              start: { x, y },
              end: { x, y: y - height },
              thickness: 0.4,
              color: rgb(0, 0, 0),
            })
          }
          const font = header || emphasize ? bold : regular
          cell.forEach((line, lineIndex) => {
            const width = font.widthOfTextAtSize(line, fontSize)
            const textX = column.align === 'right' ? x + column.width - pad - width : x + pad
            page.drawText(line, {
              x: textX,
              y: y - pad - fontSize - lineIndex * gridLeading,
              size: fontSize,
              font,
              color: rgb(0, 0, 0),
            })
          })
          x += column.width
        })
        y -= height
      }
      paintRow(headerLines, heights[0], true, false)
      bodyLines.forEach((lines, index) => {
        paintRow(lines, heights[index + 1], false, Boolean(block.boldLast) && index === bodyLines.length - 1)
      })
      y -= 12
      continue
    }

    const signatureLines = block.style === 'noc'
      ? ['Yours Faithfully,', 'For LEVEL UP BUILDCON']
      : block.style === 'demand'
        ? ['Thanking you,', 'For LEVEL UP BUILDCON']
        : ['Thanking you,', '', 'Warm Regards,', 'For LEVEL UP BUILDCON']
    const blockHeight = 8 + signatureLines.length * LEADING + STAMP_GAP_PT + LEADING
    ensure(blockHeight)
    y -= 8
    for (const line of signatureLines) {
      if (line) page.drawText(line, { x: MARGIN_X, y, size: BODY_SIZE, font: regular, color: rgb(0, 0, 0) })
      y -= LEADING
    }
    const forBaseline = y + LEADING
    const partnerBaseline = forBaseline - STAMP_GAP_PT
    page.drawLine({
      start: { x: MARGIN_X, y: partnerBaseline + 12 },
      end: { x: MARGIN_X + 140, y: partnerBaseline + 12 },
      thickness: 0.6,
      color: rgb(0, 0, 0),
    })
    page.drawText('Partner', { x: MARGIN_X, y: partnerBaseline, size: BODY_SIZE, font: regular, color: rgb(0, 0, 0) })
    y = partnerBaseline - LEADING
  }

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}

export async function generateBookingLetter(source: LetterSource, kind: LetterKind): Promise<Buffer> {
  const document = buildLetter(source, kind)
  if (document.issues.length) throw new LetterNotReadyError(document.issues)
  return renderLetterPdf(document.blocks)
}
