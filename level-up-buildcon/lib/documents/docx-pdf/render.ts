import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import { FEATURES, faceKey, loadFaces, type FaceKey } from '@/lib/documents/docx-pdf/fonts'
import {
  boxHeight,
  drawSize,
  glyphText,
  layoutBlock,
  letterSpacing,
  paginate,
  rise,
  spaceBefore,
  stackHeight,
  type Box,
  type Faces,
  type Line,
  type RowBox,
} from '@/lib/documents/docx-pdf/layout'
import { readDocument, type Block, type DocumentModel, type Paragraph, type TextFrame } from '@/lib/documents/docx-pdf/model'

function color(hex: string): RGB {
  const value = /^[0-9a-f]{6}$/i.test(hex) ? hex : '000000'
  return rgb(parseInt(value.slice(0, 2), 16) / 255, parseInt(value.slice(2, 4), 16) / 255, parseInt(value.slice(4, 6), 16) / 255)
}

class Painter {
  private fonts = new Map<FaceKey, Promise<PDFFont>>()

  constructor(
    private readonly doc: PDFDocument,
    readonly faces: Faces,
    private readonly pageHeight: number,
  ) {}

  private font(key: FaceKey): Promise<PDFFont> {
    let font = this.fonts.get(key)
    if (!font) {
      const source = this.faces[key]
      font = this.doc.embedFont(source.bytes, { subset: source.subset, features: FEATURES })
      this.fonts.set(key, font)
    }
    return font
  }

  /** A laid-out line whose top edge is `top` points below the top of the page. */
  async line(page: PDFPage, line: Line, originX: number, top: number): Promise<void> {
    const baseline = top + line.ascent
    for (const fragment of line.fragments) {
      if (fragment.kind === 'tab' || !fragment.text) continue
      // Spaces after the last word hang past the margin in Word; they are not drawn.
      if (fragment.kind === 'space' && fragment.x >= line.contentEnd - 0.01) continue
      const key = faceKey(fragment.style)
      const font = await this.font(key)
      const size = drawSize(fragment.style)
      const y = this.pageHeight - (baseline - rise(fragment.style))
      const text = glyphText(fragment.text, this.faces[key])
      const ink = color(fragment.style.color)
      const spacing = letterSpacing(text, fragment.style)
      if (spacing) {
        let x = originX + fragment.x
        for (const character of text) {
          page.drawText(character, { x, y, size, font, color: ink })
          x += font.widthOfTextAtSize(character, size) + spacing
        }
      } else {
        page.drawText(text, { x: originX + fragment.x, y, size, font, color: ink })
      }
    }

    // Underlines run across the spaces between words, never past the last word.
    let segment: { from: number; to: number; style: Line['fragments'][number]['style'] } | null = null
    const flush = () => {
      if (!segment) return
      const glyphs = this.faces[faceKey(segment.style)]
      const size = segment.style.size
      const thickness = (glyphs.underlineThickness / glyphs.unitsPerEm) * size * (segment.style.underline === 'thick' ? 2 : 1)
      const offset = (-glyphs.underlinePosition / glyphs.unitsPerEm) * size
      const draw = (shift: number) => {
        const y = this.pageHeight - (baseline + offset + shift)
        page.drawLine({ start: { x: originX + segment!.from, y }, end: { x: originX + segment!.to, y }, thickness, color: color(segment!.style.color) })
      }
      draw(0)
      if (segment.style.underline === 'double') draw(thickness * 2)
      segment = null
    }
    for (const fragment of line.fragments) {
      const underline = fragment.style.underline
      const trailing = fragment.kind === 'space' && fragment.x >= line.contentEnd - 0.01
      if (underline === 'none' || trailing || fragment.kind === 'label') {
        flush()
        continue
      }
      const start = fragment.x
      const finish = fragment.x + fragment.width
      if (segment && Math.abs(segment.from + (segment.to - segment.from) - start) < 0.5 && segment.style.underline === underline && segment.style.size === fragment.style.size) {
        segment.to = finish
      } else {
        flush()
        segment = { from: start, to: finish, style: fragment.style }
      }
    }
    flush()

    for (const fragment of line.fragments) {
      if (!fragment.style.strike || fragment.kind === 'space') continue
      const y = this.pageHeight - (baseline - fragment.style.size * 0.3)
      page.drawLine({ start: { x: originX + fragment.x, y }, end: { x: originX + fragment.x + fragment.width, y }, thickness: fragment.style.size / 18, color: color(fragment.style.color) })
    }
  }

  async boxes(page: PDFPage, boxes: Box[], originX: number, top: number): Promise<void> {
    let y = top
    for (const [index, box] of boxes.entries()) {
      if (box.kind === 'paragraph') {
        y += index === 0 ? box.before : spaceBefore(box, boxes[index - 1])
        for (const line of box.lines) {
          await this.line(page, line, originX, y)
          y += line.height
        }
        y += box.after
      } else {
        for (const row of box.rows) {
          await this.row(page, row, originX, y)
          y += row.height
        }
      }
    }
  }

  async row(page: PDFPage, row: RowBox, originX: number, top: number): Promise<void> {
    for (const cell of row.cells) {
      const x = originX + cell.x
      const { width } = cell.cell
      if (cell.cell.fill) {
        page.drawRectangle({ x, y: this.pageHeight - top - row.height, width, height: row.height, color: color(cell.cell.fill) })
      }
      const room = row.height - cell.cell.marginTop - cell.cell.marginBottom - cell.contentHeight
      const shift = cell.cell.verticalAlign === 'center' ? room / 2 : cell.cell.verticalAlign === 'bottom' ? room : 0
      await this.boxes(page, cell.content, x + cell.cell.marginLeft, top + cell.inset + cell.cell.marginTop + Math.max(0, shift))
      const edge = (from: [number, number], to: [number, number], border?: { width: number; color: string }) => {
        if (!border) return
        page.drawLine({
          start: { x: from[0], y: this.pageHeight - from[1] },
          end: { x: to[0], y: this.pageHeight - to[1] },
          thickness: border.width,
          color: color(border.color),
        })
      }
      const bottom = top + row.height
      edge([x, top], [x + width, top], cell.cell.borders.top)
      edge([x, bottom], [x + width, bottom], cell.cell.borders.bottom)
      edge([x, top], [x, bottom], cell.cell.borders.left)
      edge([x + width, top], [x + width, bottom], cell.cell.borders.right)
    }
  }
}

function withPageNumbers(blocks: Block[], page: number, total: number): Block[] {
  return blocks.map((block): Block => {
    if (block.kind === 'table') {
      return { ...block, rows: block.rows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell, blocks: withPageNumbers(cell.blocks, page, total) })) })) }
    }
    return {
      ...block,
      inlines: block.inlines.map((inline) => (inline.kind === 'field' ? { kind: 'text', text: String(inline.field === 'PAGE' ? page : total), style: inline.style } : inline)),
      frames: block.frames.map((frame) => ({ ...frame, blocks: withPageNumbers(frame.blocks, page, total) })),
    }
  })
}

/** Header or footer content for one page, with its text boxes. */
async function drawMargin(
  painter: Painter,
  model: DocumentModel,
  pdfPage: PDFPage,
  blocks: Block[],
  where: 'header' | 'footer',
  page: number,
  total: number,
): Promise<void> {
  if (!blocks.length) return
  const setup = model.page
  const width = setup.width - setup.marginLeft - setup.marginRight
  const numbered = withPageNumbers(blocks, page, total)
  const boxes = numbered.map((block) => layoutBlock(block, width, painter.faces))
  const height = stackHeight(boxes)
  // A footer sits on the footer distance from the foot of the page; a header hangs from the header distance.
  let y = where === 'footer' ? setup.height - setup.footerDistance - height : setup.headerDistance
  for (const [index, box] of boxes.entries()) {
    if (index > 0 && box.kind === 'paragraph') y -= box.before - spaceBefore(box, boxes[index - 1])
    const frames = box.kind === 'paragraph' ? (box.paragraph as Paragraph).frames : []
    for (const frame of frames) await drawFrame(painter, model, pdfPage, frame, y + (box.kind === 'paragraph' ? box.before : 0))
    await painter.boxes(pdfPage, [box], setup.marginLeft, y)
    y += boxHeight(box)
  }
}

async function drawFrame(painter: Painter, model: DocumentModel, pdfPage: PDFPage, frame: TextFrame, paragraphTop: number): Promise<void> {
  const setup = model.page
  const contentWidth = setup.width - setup.marginLeft - setup.marginRight
  const horizontal = frame.x
  const areaLeft = horizontal.relative === 'page' ? 0 : setup.marginLeft
  const areaWidth = horizontal.relative === 'page' ? setup.width : contentWidth
  const x =
    horizontal.align === 'center'
      ? areaLeft + (areaWidth - frame.width) / 2
      : horizontal.align === 'right'
        ? areaLeft + areaWidth - frame.width
        : areaLeft + (horizontal.align === 'left' ? 0 : horizontal.offset)
  const vertical = frame.y
  const y =
    vertical.relative === 'page' ? vertical.offset : vertical.relative === 'margin' ? setup.marginTop + vertical.offset : paragraphTop + vertical.offset
  const inner = Math.max(1, frame.width - frame.insetLeft * 2)
  // A text box sized to its text keeps "Page 10 of 35" on one line, as the office renderer does.
  const boxes = frame.blocks.map((block) => {
    if (block.kind !== 'paragraph' || block.align !== 'left') return layoutBlock(block, inner, painter.faces)
    const natural = layoutBlock(block, 10000, painter.faces)
    const needed = natural.kind === 'paragraph' ? Math.max(...natural.lines.map((line) => line.contentEnd)) + block.right : inner
    return layoutBlock(block, Math.max(inner, needed), painter.faces)
  })
  await painter.boxes(pdfPage, boxes, x + frame.insetLeft, y + frame.insetTop)
}

export async function renderModel(model: DocumentModel): Promise<Buffer> {
  const faces = await loadFaces()
  const setup = model.page
  const width = setup.width - setup.marginLeft - setup.marginRight
  const boxes = model.body.map((block) => layoutBlock(block, width, faces))
  const pages = paginate(boxes, setup.height - setup.marginTop - setup.marginBottom)

  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle('Agreement for Sale')
  doc.setCreator('ProjectDesk')
  doc.setProducer('ProjectDesk')
  const painter = new Painter(doc, faces, setup.height)
  for (const [index, placements] of pages.entries()) {
    const pdfPage = doc.addPage([setup.width, setup.height])
    for (const placement of placements) {
      const top = setup.marginTop + placement.y
      if (placement.kind === 'line') await painter.line(pdfPage, placement.line, setup.marginLeft, top)
      else await painter.row(pdfPage, placement.row, setup.marginLeft, top)
    }
    await drawMargin(painter, model, pdfPage, model.header, 'header', index + 1, pages.length)
    await drawMargin(painter, model, pdfPage, model.footer, 'footer', index + 1, pages.length)
  }
  return Buffer.from(await doc.save())
}

/** The Word file as a PDF, laid out from the document itself. */
export async function renderDocxToPdf(docx: Buffer | Uint8Array): Promise<Buffer> {
  return renderModel(readDocument(docx))
}
