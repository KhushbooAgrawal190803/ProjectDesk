import { DocxRenderError, type Block, type Inline, type Paragraph, type RunStyle, type Table, type TableCell, type TabStop } from '@/lib/documents/docx-pdf/model'
import { faceKey, type Face, type FaceKey } from '@/lib/documents/docx-pdf/fonts'

/**
 * Line breaking and pagination. The measurements follow LibreOffice, the
 * office renderer the PDF is checked against: a line is as tall as the
 * largest ascent plus the largest descent and line gap on it, rounded to a
 * twip, and proportional spacing is a whole percentage of that height.
 */

export type Faces = Record<FaceKey, Face>

const EPSILON = 0.01
/** Words must fit within a thousandth of a point; the office renderer allows no more. */
const FIT = 0.001
/** Word's default tab stops every half inch. */
const DEFAULT_TAB = 36
/** Size and rise of superscript and subscript text, as a share of the font size. */
const SCRIPT_SIZE = 0.58
const SUPERSCRIPT_RISE = 0.33
const SUBSCRIPT_RISE = -0.08

export interface Fragment {
  kind: 'text' | 'space' | 'tab' | 'label'
  text: string
  style: RunStyle
  /** Points from the start of the text column. */
  x: number
  width: number
}

export interface Line {
  fragments: Fragment[]
  /** Distance to the next line. */
  height: number
  /** Room the line needs at the foot of a page: its text, without the extra line spacing below it. */
  fitHeight: number
  /** Baseline, measured down from the top of the line. */
  ascent: number
  /** Where the text ends, without trailing spaces. */
  contentEnd: number
}

export interface ParagraphBox {
  kind: 'paragraph'
  paragraph: Paragraph
  lines: Line[]
  before: number
  after: number
}

export interface CellBox {
  cell: TableCell
  /** Left border, from the start of the text column. */
  x: number
  content: Box[]
  contentHeight: number
  /** Where the text starts below the top of the row: half the top border. */
  inset: number
}

/**
 * LibreOffice's table rows, measured against its output: a border takes its
 * width out of the row, half above the text and half below, and the last
 * line in a cell keeps only part of the extra space that proportional line
 * spacing adds below a line.
 */
const BORDER_ROOM = 1
const LAST_LINE_SPACING_KEPT = 0.735

export interface RowBox {
  cells: CellBox[]
  height: number
  keepNext: boolean
}

export interface TableBox {
  kind: 'table'
  table: Table
  rows: RowBox[]
}

export type Box = ParagraphBox | TableBox

// ---------------------------------------------------------------- text

export function displayText(text: string, style: RunStyle): string {
  return style.caps || style.smallCaps ? text.toUpperCase() : text
}

export function drawSize(style: RunStyle): number {
  return style.vertAlign === 'baseline' ? style.size : style.size * SCRIPT_SIZE
}

export function rise(style: RunStyle): number {
  if (style.vertAlign === 'superscript') return style.size * SUPERSCRIPT_RISE
  if (style.vertAlign === 'subscript') return style.size * SUBSCRIPT_RISE
  return 0
}

/** The characters as the font draws them; a few Word characters have no glyph of their own. */
export function glyphText(text: string, glyphs: Face): string {
  let out = ''
  for (const character of text) {
    const code = character.codePointAt(0) as number
    if (glyphs.has(code)) out += character
    else if (code === 0x2011) out += '-'
    else if (code === 0x00a0 || code === 0x2007 || code === 0x202f) out += ' '
    else if (/\s/.test(character)) out += ' '
    else {
      throw new DocxRenderError(
        `The character "${character}" (U+${code.toString(16).toUpperCase().padStart(4, '0')}) cannot be shown in the agreement PDF font.`
      )
    }
  }
  return out
}

/** Condensed spacing is not applied to spaces, as in LibreOffice; a space keeps its width. */
export function letterSpacing(text: string, style: RunStyle): number {
  return style.spacing < 0 && !/\S/.test(text) ? 0 : style.spacing
}

export function measure(faces: Faces, text: string, style: RunStyle): number {
  const glyphs = faces[faceKey(style)]
  const size = drawSize(style)
  const drawn = glyphText(text, glyphs)
  // Letter-spaced text is set one character at a time, without ligatures.
  const spacing = letterSpacing(drawn, style)
  if (spacing) {
    let width = 0
    for (const character of drawn) width += (glyphs.advance(character.codePointAt(0) as number) / glyphs.unitsPerEm) * size + spacing
    return width
  }
  return (glyphs.width(drawn) / glyphs.unitsPerEm) * size
}

function metrics(faces: Faces, style: RunStyle): { ascent: number; descent: number } {
  const glyphs = faces[faceKey(style)]
  const scale = style.size / glyphs.unitsPerEm
  return { ascent: glyphs.ascent * scale, descent: (glyphs.descent + glyphs.lineGap) * scale }
}

function lineHeight(paragraph: Paragraph, faces: Faces, styles: RunStyle[]): { height: number; ascent: number; fitHeight: number } {
  let ascent = 0
  let descent = 0
  for (const style of styles) {
    const font = metrics(faces, style)
    ascent = Math.max(ascent, font.ascent)
    descent = Math.max(descent, font.descent)
  }
  const single = Math.round((ascent + descent) * 20)
  const { rule, value } = paragraph.line
  if (rule === 'exact') return { height: value, ascent: Math.min(ascent, value), fitHeight: value }
  if (rule === 'atLeast') {
    const natural = single / 20
    return value > natural ? { height: value, ascent: ascent + (value - natural), fitHeight: value } : { height: natural, ascent, fitHeight: natural }
  }
  const percent = Math.round(value * 100)
  const height = Math.floor((single * percent) / 100) / 20
  return { height, ascent, fitHeight: Math.min(height, single / 20) }
}

// ---------------------------------------------------------------- atoms

interface Atom {
  kind: 'text' | 'space' | 'tab' | 'break'
  text: string
  style: RunStyle
  width: number
  /** True when no line may break between this atom and the one before it. */
  joined: boolean
}

// Where a line may break inside a run of text without spaces, following the
// Unicode line breaking rules LibreOffice applies: after a hyphen or dash
// (but not before a figure, so "PIN-834001" stays whole), and before an
// opening bracket that follows punctuation (",(" or ")(").
const AFTER_HYPHEN = /(?<=[^\s][-\u2013\u2014])(?=[^\d])|(?<=[,.;:!?)\]])(?=[([])/u

function atomsOf(inlines: Inline[], faces: Faces): Atom[] {
  const atoms: Atom[] = []
  let wordBefore = false
  for (const inline of inlines) {
    if (inline.kind === 'field') throw new DocxRenderError('A page number field was found outside the footer.')
    if (inline.kind !== 'text') {
      atoms.push({ kind: inline.kind, text: '', style: inline.style, width: 0, joined: false })
      wordBefore = false
      continue
    }
    const text = displayText(inline.text, inline.style)
    for (const match of text.matchAll(/ +|[^ ]+/g)) {
      const piece = match[0]
      if (piece.startsWith(' ')) {
        atoms.push({ kind: 'space', text: piece, style: inline.style, width: measure(faces, piece, inline.style), joined: false })
        wordBefore = false
        continue
      }
      piece.split(AFTER_HYPHEN).forEach((part, index) => {
        const previous = atoms[atoms.length - 1]
        const afterHyphen = previous?.kind === 'text' && /[-\u2013\u2014]$/.test(previous.text)
        atoms.push({
          kind: 'text',
          text: part,
          style: inline.style,
          width: measure(faces, part, inline.style),
          joined: index === 0 && wordBefore && !afterHyphen,
        })
        wordBefore = true
      })
    }
  }
  return atoms
}

// ---------------------------------------------------------------- paragraphs

function nextTab(paragraph: Paragraph, x: number): TabStop {
  const candidates = paragraph.tabs.filter((stop) => stop.pos > x + EPSILON)
  // A hanging indent is a tab stop for the first line.
  if (paragraph.firstLine < 0 && paragraph.left > x + EPSILON) candidates.push({ pos: paragraph.left, align: 'left' })
  candidates.sort((a, b) => a.pos - b.pos)
  if (candidates[0]) return candidates[0]
  return { pos: (Math.floor(x / DEFAULT_TAB + 1e-6) + 1) * DEFAULT_TAB, align: 'left' }
}

export function layoutParagraph(paragraph: Paragraph, width: number, faces: Faces): ParagraphBox {
  const atoms = atomsOf(paragraph.inlines, faces)
  const end = width - paragraph.right
  const lines: Array<{ fragments: Fragment[]; byBreak: boolean; start: number }> = []
  let fragments: Fragment[] = []
  let start = paragraph.left + paragraph.firstLine
  let x = start

  const newLine = (byBreak: boolean) => {
    lines.push({ fragments, byBreak, start })
    fragments = []
    start = paragraph.left
    x = start
  }
  const tabTo = (style: RunStyle) => {
    const stop = nextTab(paragraph, x)
    if (stop.align !== 'left') throw new DocxRenderError('Only left-aligned tab stops are supported in the agreement.')
    fragments.push({ kind: 'tab', text: '', style, x, width: Math.max(0, stop.pos - x) })
    x = Math.max(x, stop.pos)
  }

  const label = paragraph.label
  if (label) {
    const text = displayText(label.text, label.style)
    const labelWidth = measure(faces, text, label.style)
    const labelX = label.align === 'right' ? x - labelWidth : label.align === 'center' ? x - labelWidth / 2 : x
    fragments.push({ kind: 'label', text, style: label.style, x: labelX, width: labelWidth })
    x = labelX + labelWidth
    if (label.suffix === 'tab') tabTo(label.style)
    else if (label.suffix === 'space') {
      const space = measure(faces, ' ', label.style)
      fragments.push({ kind: 'space', text: ' ', style: label.style, x, width: space })
      x += space
    }
  }

  let index = 0
  while (index < atoms.length) {
    const atom = atoms[index]
    if (atom.kind === 'space') {
      // Spaces never wrap; at the end of a line they hang past the margin, as in Word.
      fragments.push({ kind: 'space', text: atom.text, style: atom.style, x, width: atom.width })
      x += atom.width
      index += 1
      continue
    }
    if (atom.kind === 'break') {
      newLine(true)
      index += 1
      continue
    }
    if (atom.kind === 'tab') {
      // A tab that would pass the right indent stops there; it does not wrap.
      if (nextTab(paragraph, x).pos > end) {
        fragments.push({ kind: 'tab', text: '', style: atom.style, x, width: Math.max(0, end - x) })
        x = Math.max(x, end)
      } else {
        tabTo(atom.style)
      }
      index += 1
      continue
    }
    let last = index + 1
    while (last < atoms.length && atoms[last].kind === 'text' && atoms[last].joined) last += 1
    const word = atoms.slice(index, last)
    const wordWidth = word.reduce((sum, item) => sum + item.width, 0)
    if (x + wordWidth > end + FIT && fragments.length) {
      newLine(false)
      continue
    }
    if (x + wordWidth > end + FIT) {
      // A word longer than the whole line is broken between characters.
      const fitted: Atom[] = []
      const rest: Atom[] = []
      let used = x
      for (const item of word) {
        let taken = ''
        let left = ''
        for (const character of item.text) {
          const characterWidth = measure(faces, character, item.style)
          if (!left && (used + characterWidth <= end + FIT || (!fitted.length && !taken))) {
            taken += character
            used += characterWidth
          } else left += character
        }
        if (taken) fitted.push({ ...item, text: taken, width: measure(faces, taken, item.style) })
        if (left) rest.push({ ...item, text: left, width: measure(faces, left, item.style), joined: rest.length > 0 })
      }
      for (const item of fitted) {
        fragments.push({ kind: 'text', text: item.text, style: item.style, x, width: item.width })
        x += item.width
      }
      newLine(false)
      atoms.splice(index, last - index, ...rest)
      continue
    }
    for (const item of word) {
      fragments.push({ kind: 'text', text: item.text, style: item.style, x, width: item.width })
      x += item.width
    }
    index = last
  }
  lines.push({ fragments, byBreak: false, start })

  const laid: Line[] = lines.map((line, lineIndex) => {
    const content = line.fragments.filter((fragment) => fragment.kind !== 'space')
    const contentEnd = content.length ? Math.max(...content.map((fragment) => fragment.x + fragment.width)) : line.start
    const slack = end - contentEnd
    const lastLine = lineIndex === lines.length - 1
    if ((paragraph.align === 'center' || paragraph.align === 'right') && slack > 0) {
      const shift = paragraph.align === 'right' ? slack : slack / 2
      for (const fragment of line.fragments) fragment.x += shift
    } else if (paragraph.align === 'both' && !lastLine && !line.byBreak && slack > EPSILON) {
      // Justified: the spare width goes to the spaces after the last tab.
      const lastTab = line.fragments.map((fragment) => fragment.kind).lastIndexOf('tab')
      const stretch = line.fragments.map(
        (fragment, position) => position > lastTab && fragment.kind === 'space' && fragment.x < contentEnd - EPSILON
      )
      const count = line.fragments.reduce((sum, fragment, position) => sum + (stretch[position] ? fragment.text.length : 0), 0)
      if (count) {
        const extra = slack / count
        let offset = 0
        line.fragments.forEach((fragment, position) => {
          fragment.x += offset
          if (stretch[position]) {
            const grow = extra * fragment.text.length
            fragment.width += grow
            offset += grow
          }
        })
      }
    }
    // A wrapped line holding nothing but spaces takes the height of the
    // paragraph style's font, as LibreOffice gives it.
    const blank = !lastLine && line.fragments.length > 0 && line.fragments.every((fragment) => fragment.kind === 'space')
    const styles = blank ? [paragraph.styleRun] : line.fragments.length ? line.fragments.map((fragment) => fragment.style) : [paragraph.mark]
    const { height, ascent, fitHeight } = lineHeight(paragraph, faces, styles)
    const shifted = line.fragments.filter((fragment) => fragment.kind !== 'space')
    return {
      fragments: line.fragments,
      height,
      fitHeight,
      ascent,
      contentEnd: shifted.length ? Math.max(...shifted.map((fragment) => fragment.x + fragment.width)) : line.start,
    }
  })

  return { kind: 'paragraph', paragraph, lines: laid, before: paragraph.before, after: paragraph.after }
}

// ---------------------------------------------------------------- tables

export function boxHeight(box: Box): number {
  if (box.kind === 'paragraph') return box.before + box.lines.reduce((sum, line) => sum + line.height, 0) + box.after
  return box.rows.reduce((sum, row) => sum + row.height, 0)
}

/**
 * Space between two paragraphs is the larger of the first one's space after
 * and the second one's space before, not their sum, as LibreOffice sets the master.
 */
export function spaceBefore(box: Box, previous: Box | undefined): number {
  if (box.kind !== 'paragraph') return 0
  const after = previous?.kind === 'paragraph' ? previous.after : 0
  return Math.max(0, box.before - after)
}

/** Height of consecutive blocks, with the space between paragraphs collapsed. */
export function stackHeight(boxes: Box[]): number {
  return boxes.reduce((sum, box, index) => sum + boxHeight(box) - (box.kind === 'paragraph' ? box.before - spaceBefore(box, boxes[index - 1]) : 0), 0)
}

function layoutTable(table: Table, faces: Faces): TableBox {
  const rows = table.rows.map((row): RowBox => {
    let x = table.left
    const cells = row.cells.map((cell): CellBox => {
      const inner = cell.width - cell.marginLeft - cell.marginRight
      const content = cell.blocks.map((block) => layoutBlock(block, inner, faces))
      let contentHeight = stackHeight(content)
      const last = content[content.length - 1]
      const lastLine = last?.kind === 'paragraph' ? last.lines[last.lines.length - 1] : undefined
      if (lastLine) contentHeight -= (lastLine.height - lastLine.fitHeight) * (1 - LAST_LINE_SPACING_KEPT)
      const box = { cell, x, content, contentHeight, inset: ((cell.borders.top?.width ?? 0) * BORDER_ROOM) / 2 }
      x += cell.width
      return box
    })
    const needed = Math.max(0, ...cells.map((cell) => cell.contentHeight + cell.cell.marginTop + cell.cell.marginBottom))
    if (row.heightRule === 'exact' && needed > row.height + EPSILON) {
      throw new DocxRenderError('A table row has a fixed height that would cut off its text.')
    }
    const borders = Math.max(0, ...cells.map((cell) => ((cell.cell.borders.top?.width ?? 0) + (cell.cell.borders.bottom?.width ?? 0)) * BORDER_ROOM / 2))
    return {
      cells,
      height: (row.heightRule === 'exact' ? row.height : Math.max(row.height, needed)) + borders,
      keepNext: cells.some((cell) => cell.content.some((item) => item.kind === 'paragraph' && item.paragraph.keepNext)),
    }
  })
  return { kind: 'table', table, rows }
}

export function layoutBlock(block: Block, width: number, faces: Faces): Box {
  return block.kind === 'paragraph' ? layoutParagraph(block, width, faces) : layoutTable(block, faces)
}

// ---------------------------------------------------------------- pages

export type Placement =
  | { kind: 'line'; line: Line; y: number }
  | { kind: 'row'; row: RowBox; y: number }

/** How many lines of a paragraph must stay together at the top of a page. */
function headLines(box: ParagraphBox): number {
  const count = box.lines.length
  if (!box.paragraph.widowControl) return 1
  return count <= 3 ? count : 2
}

function rowChain(rows: RowBox[], from: number): { height: number; reachesEnd: boolean } {
  let height = 0
  for (let index = from; index < rows.length; index += 1) {
    height += rows[index].height
    if (!rows[index].keepNext) return { height, reachesEnd: false }
  }
  return { height, reachesEnd: true }
}

/** The height that must fit on one page for a block kept with the next. */
function keepChain(boxes: Box[], from: number): number {
  let height = 0
  for (let index = from; index < boxes.length; index += 1) {
    const box = boxes[index]
    if (box.kind === 'table') {
      const chain = rowChain(box.rows, 0)
      height += chain.height
      if (!chain.reachesEnd || box.rows.length === 0) return height
      continue
    }
    const before = index === from ? box.before : spaceBefore(box, boxes[index - 1])
    if (box.paragraph.keepNext) {
      height += boxHeight(box) - box.before + before
      continue
    }
    const head = box.lines.slice(0, headLines(box))
    return height + before + head.slice(0, -1).reduce((sum, line) => sum + line.height, 0) + (head[head.length - 1]?.fitHeight ?? 0)
  }
  return height
}

export function paginate(boxes: Box[], pageHeight: number): Placement[][] {
  const pages: Placement[][] = [[]]
  let y = 0
  const current = () => pages[pages.length - 1]
  const newPage = () => {
    pages.push([])
    y = 0
  }
  const fits = (height: number) => y + height <= pageHeight + EPSILON

  boxes.forEach((box, index) => {
    if (box.kind === 'table') {
      box.rows.forEach((row, rowIndex) => {
        if (y > 0 && row.keepNext) {
          const chain = rowChain(box.rows, rowIndex)
          const need = chain.reachesEnd ? chain.height + keepChain(boxes, index + 1) : chain.height
          if (need <= pageHeight && !fits(need)) newPage()
        }
        if (y > 0 && !fits(row.height)) newPage()
        if (row.height > pageHeight + EPSILON) throw new DocxRenderError('A table row is taller than a page.')
        current().push({ kind: 'row', row, y })
        y += row.height
      })
      return
    }

    const paragraph = box.paragraph
    if (paragraph.pageBreakBefore && current().length) newPage()
    if (paragraph.keepNext && y > 0) {
      const need = keepChain(boxes, index)
      if (need <= pageHeight && !fits(need)) newPage()
    }
    const body = boxHeight(box) - box.after
    if (paragraph.keepLines && y > 0 && body <= pageHeight && !fits(body)) newPage()

    const lines = box.lines
    const before = spaceBefore(box, boxes[index - 1])
    if (y > 0 && !fits(before + lines[0].fitHeight)) newPage()
    // Space before is dropped at the top of a page the text flowed onto.
    const flowedOnto = () => y === 0 && pages.length > 1 && !paragraph.pageBreakBefore
    if (!flowedOnto()) y += y === 0 ? box.before : before
    let line = 0
    while (line < lines.length) {
      if (y > 0 && !fits(lines[line].fitHeight)) {
        let breakAt = line
        if (paragraph.widowControl) {
          // No single line alone at the foot of a page, or at the top of the next.
          if (lines.length - breakAt === 1 && breakAt >= 2) breakAt -= 1
          if (breakAt === 1) breakAt = 0
        }
        // This paragraph's lines are the last ones on the page; move the ones that go.
        const moved = line - breakAt
        current().splice(current().length - moved, moved)
        newPage()
        line = breakAt
        continue
      }
      current().push({ kind: 'line', line: lines[line], y })
      y += lines[line].height
      line += 1
    }
    y += box.after
  })
  return pages.filter((page, index) => page.length || index === 0)
}
