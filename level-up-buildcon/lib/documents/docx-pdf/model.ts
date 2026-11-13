import PizZip from 'pizzip'
import { attr, child, childrenNamed, numberAttr, onOff, parseXml, type XmlNode } from '@/lib/documents/docx-pdf/xml'

/**
 * The Word file read into blocks with every property resolved the way Word
 * resolves it: document defaults, then the paragraph style chain, then list
 * numbering, then direct formatting. Lengths are in points.
 */

export class DocxRenderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocxRenderError'
  }
}

export interface RunStyle {
  font: string
  /** Points. */
  size: number
  bold: boolean
  italic: boolean
  underline: 'none' | 'single' | 'thick' | 'double'
  strike: boolean
  caps: boolean
  smallCaps: boolean
  vertAlign: 'baseline' | 'superscript' | 'subscript'
  /** Points added after every character. */
  spacing: number
  color: string
}

type RunPatch = Partial<RunStyle>

export type Inline =
  | { kind: 'text'; text: string; style: RunStyle }
  | { kind: 'tab'; style: RunStyle }
  | { kind: 'break'; style: RunStyle }
  | { kind: 'field'; field: 'PAGE' | 'NUMPAGES'; style: RunStyle }

export interface TabStop {
  /** Points from the start of the text column. */
  pos: number
  align: 'left' | 'center' | 'right' | 'decimal'
}

export interface LineRule {
  rule: 'auto' | 'exact' | 'atLeast'
  /** A multiple of single spacing for auto, points otherwise. */
  value: number
}

export interface FramePosition {
  relative: string
  align?: string
  offset: number
}

export interface TextFrame {
  x: FramePosition
  y: FramePosition
  width: number
  height: number
  insetLeft: number
  insetTop: number
  blocks: Block[]
}

export interface ListLabel {
  text: string
  style: RunStyle
  suffix: 'tab' | 'space' | 'nothing'
  align: 'left' | 'center' | 'right'
}

export interface Paragraph {
  kind: 'paragraph'
  styleId: string
  align: 'left' | 'center' | 'right' | 'both'
  left: number
  right: number
  /** Negative for a hanging indent. */
  firstLine: number
  before: number
  after: number
  line: LineRule
  keepNext: boolean
  keepLines: boolean
  pageBreakBefore: boolean
  widowControl: boolean
  tabs: TabStop[]
  inlines: Inline[]
  /** The paragraph mark, which sets the height of an empty paragraph. */
  mark: RunStyle
  /** The paragraph style's own character formatting. */
  styleRun: RunStyle
  label?: ListLabel
  frames: TextFrame[]
}

export interface Border {
  width: number
  color: string
}

export interface TableCell {
  width: number
  marginLeft: number
  marginRight: number
  marginTop: number
  marginBottom: number
  borders: { top?: Border; left?: Border; bottom?: Border; right?: Border }
  fill?: string
  verticalAlign: 'top' | 'center' | 'bottom'
  blocks: Block[]
}

export interface TableRow {
  cells: TableCell[]
  height: number
  heightRule: 'auto' | 'atLeast' | 'exact'
  cantSplit: boolean
}

export interface Table {
  kind: 'table'
  /** Left border edge, in points from the start of the text column. */
  left: number
  width: number
  rows: TableRow[]
}

export type Block = Paragraph | Table

export interface PageSetup {
  width: number
  height: number
  marginLeft: number
  marginRight: number
  marginTop: number
  marginBottom: number
  headerDistance: number
  footerDistance: number
}

export interface DocumentModel {
  page: PageSetup
  body: Block[]
  header: Block[]
  footer: Block[]
}

const twips = (value: number | undefined) => (value ?? 0) / 20
const EMU_PER_POINT = 12700

// ---------------------------------------------------------------- properties

interface IndentPatch {
  left?: number
  right?: number
  firstLine?: number
  hanging?: number
  leftChars?: number
  rightChars?: number
  firstLineChars?: number
  hangingChars?: number
}

interface SpacingPatch {
  before?: number
  after?: number
  line?: number
  lineRule?: string
  beforeAutospacing?: boolean
  afterAutospacing?: boolean
}

interface ParaPatch {
  styleId?: string
  jc?: string
  ind: IndentPatch
  spacing: SpacingPatch
  keepNext?: boolean
  keepLines?: boolean
  pageBreakBefore?: boolean
  widowControl?: boolean
  numId?: number
  ilvl?: number
  tabs: Array<{ val: string; pos: number }>
}

function emptyPara(): ParaPatch {
  return { ind: {}, spacing: {}, tabs: [] }
}

function readRunProps(rPr: XmlNode | undefined): RunPatch {
  const patch: RunPatch = {}
  if (!rPr) return patch
  const fonts = child(rPr, 'w:rFonts')
  const family = attr(fonts, 'w:ascii') ?? attr(fonts, 'w:hAnsi')
  if (family) patch.font = family
  const size = numberAttr(child(rPr, 'w:sz'), 'w:val')
  if (size != null) patch.size = size / 2
  const bold = onOff(child(rPr, 'w:b'))
  if (bold != null) patch.bold = bold
  const italic = onOff(child(rPr, 'w:i'))
  if (italic != null) patch.italic = italic
  const underline = child(rPr, 'w:u')
  if (underline) {
    const value = attr(underline, 'w:val') || 'single'
    patch.underline = value === 'none' ? 'none' : value === 'thick' ? 'thick' : value === 'double' ? 'double' : 'single'
  }
  const strike = onOff(child(rPr, 'w:strike'))
  if (strike != null) patch.strike = strike
  const caps = onOff(child(rPr, 'w:caps'))
  if (caps != null) patch.caps = caps
  const smallCaps = onOff(child(rPr, 'w:smallCaps'))
  if (smallCaps != null) patch.smallCaps = smallCaps
  const vertical = attr(child(rPr, 'w:vertAlign'), 'w:val')
  if (vertical) patch.vertAlign = vertical === 'superscript' ? 'superscript' : vertical === 'subscript' ? 'subscript' : 'baseline'
  const spacing = numberAttr(child(rPr, 'w:spacing'), 'w:val')
  if (spacing != null) patch.spacing = twips(spacing)
  const color = attr(child(rPr, 'w:color'), 'w:val')
  if (color) patch.color = color === 'auto' ? '000000' : color
  return patch
}

/** Word keeps one of a first-line or hanging indent; whichever is set later wins. */
function mergeIndent(base: IndentPatch, patch: IndentPatch): IndentPatch {
  const out = { ...base }
  if (patch.firstLine != null || patch.hanging != null) {
    delete out.firstLine
    delete out.hanging
  }
  if (patch.firstLineChars != null || patch.hangingChars != null) {
    delete out.firstLineChars
    delete out.hangingChars
  }
  for (const [key, value] of Object.entries(patch) as Array<[keyof IndentPatch, number | undefined]>) {
    if (value != null) out[key] = value
  }
  return out
}

function isOn(value: string | undefined): boolean | undefined {
  return value == null ? undefined : value === '1' || value === 'true' || value === 'on'
}

function readPara(pPr: XmlNode | undefined): ParaPatch {
  const patch = emptyPara()
  if (!pPr) return patch
  const style = attr(child(pPr, 'w:pStyle'), 'w:val')
  if (style) patch.styleId = style
  const jc = attr(child(pPr, 'w:jc'), 'w:val')
  if (jc) patch.jc = jc
  const ind = child(pPr, 'w:ind')
  if (ind) {
    const read = (name: string) => numberAttr(ind, name)
    const values: IndentPatch = {
      left: read('w:left') ?? read('w:start'),
      right: read('w:right') ?? read('w:end'),
      firstLine: read('w:firstLine'),
      hanging: read('w:hanging'),
      leftChars: read('w:leftChars') ?? read('w:startChars'),
      rightChars: read('w:rightChars') ?? read('w:endChars'),
      firstLineChars: read('w:firstLineChars'),
      hangingChars: read('w:hangingChars'),
    }
    patch.ind = mergeIndent({}, values)
  }
  const spacing = child(pPr, 'w:spacing')
  if (spacing) {
    patch.spacing = {
      before: numberAttr(spacing, 'w:before'),
      after: numberAttr(spacing, 'w:after'),
      line: numberAttr(spacing, 'w:line'),
      lineRule: attr(spacing, 'w:lineRule'),
      beforeAutospacing: isOn(attr(spacing, 'w:beforeAutospacing')),
      afterAutospacing: isOn(attr(spacing, 'w:afterAutospacing')),
    }
  }
  const flag = (name: string) => onOff(child(pPr, name))
  patch.keepNext = flag('w:keepNext')
  patch.keepLines = flag('w:keepLines')
  patch.pageBreakBefore = flag('w:pageBreakBefore')
  patch.widowControl = flag('w:widowControl')
  const numPr = child(pPr, 'w:numPr')
  if (numPr) {
    patch.numId = numberAttr(child(numPr, 'w:numId'), 'w:val')
    patch.ilvl = numberAttr(child(numPr, 'w:ilvl'), 'w:val')
  }
  for (const tab of childrenNamed(child(pPr, 'w:tabs'), 'w:tab')) {
    patch.tabs.push({ val: attr(tab, 'w:val') || 'left', pos: numberAttr(tab, 'w:pos') ?? 0 })
  }
  return patch
}

function mergePara(base: ParaPatch, patch: ParaPatch): ParaPatch {
  const out: ParaPatch = {
    ...base,
    ind: mergeIndent(base.ind, patch.ind),
    spacing: { ...base.spacing },
    tabs: [...base.tabs, ...patch.tabs],
  }
  for (const [key, value] of Object.entries(patch.spacing)) {
    if (value != null) (out.spacing as Record<string, unknown>)[key] = value
  }
  for (const key of ['styleId', 'jc', 'keepNext', 'keepLines', 'pageBreakBefore', 'widowControl', 'numId', 'ilvl'] as const) {
    if (patch[key] != null) (out as unknown as Record<string, unknown>)[key] = patch[key]
  }
  return out
}

const BASE_RUN: RunStyle = {
  font: 'Times New Roman',
  size: 10,
  bold: false,
  italic: false,
  underline: 'none',
  strike: false,
  caps: false,
  smallCaps: false,
  vertAlign: 'baseline',
  spacing: 0,
  color: '000000',
}

function applyRun(base: RunStyle, ...patches: RunPatch[]): RunStyle {
  const out = { ...base }
  for (const patch of patches) {
    for (const [key, value] of Object.entries(patch)) {
      if (value != null) (out as Record<string, unknown>)[key] = value
    }
  }
  return out
}

// ---------------------------------------------------------------- styles

interface StyleDef {
  type: string
  basedOn?: string
  run: RunPatch
  para: ParaPatch
}

class Styles {
  private byId = new Map<string, StyleDef>()
  readonly defaultRun: RunPatch
  readonly defaultPara: ParaPatch
  readonly defaultParagraphStyle: string

  constructor(stylesXml: XmlNode | undefined) {
    const root = child(stylesXml, 'w:styles')
    const defaults = child(root, 'w:docDefaults')
    this.defaultRun = readRunProps(child(child(defaults, 'w:rPrDefault'), 'w:rPr'))
    this.defaultPara = readPara(child(child(defaults, 'w:pPrDefault'), 'w:pPr'))
    let fallback = 'Normal'
    for (const style of childrenNamed(root, 'w:style')) {
      const id = attr(style, 'w:styleId')
      if (!id) continue
      const type = attr(style, 'w:type') || 'paragraph'
      if (type === 'paragraph' && attr(style, 'w:default') === '1') fallback = id
      this.byId.set(id, {
        type,
        basedOn: attr(child(style, 'w:basedOn'), 'w:val'),
        run: readRunProps(child(style, 'w:rPr')),
        para: readPara(child(style, 'w:pPr')),
      })
    }
    this.defaultParagraphStyle = fallback
  }

  private chain(id: string | undefined): StyleDef[] {
    const out: StyleDef[] = []
    const seen = new Set<string>()
    let current = id
    while (current && !seen.has(current)) {
      seen.add(current)
      const style = this.byId.get(current)
      if (!style) break
      out.unshift(style)
      current = style.basedOn
    }
    return out
  }

  paragraph(id: string): { run: RunPatch; para: ParaPatch } {
    let run: RunPatch = {}
    let para = emptyPara()
    for (const style of this.chain(id)) {
      run = { ...run, ...Object.fromEntries(Object.entries(style.run).filter(([, value]) => value != null)) }
      para = mergePara(para, style.para)
    }
    return { run, para }
  }

  character(id: string | undefined): RunPatch {
    let run: RunPatch = {}
    for (const style of this.chain(id)) run = { ...run, ...style.run }
    return run
  }
}

// ---------------------------------------------------------------- numbering

interface Level {
  start: number
  format: string
  text: string
  suffix: 'tab' | 'space' | 'nothing'
  align: 'left' | 'center' | 'right'
  para: ParaPatch
  run: RunPatch
}

function toRoman(value: number): string {
  const pairs: Array<[number, string]> = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let rest = value
  let out = ''
  for (const [amount, glyph] of pairs) {
    while (rest >= amount) {
      out += glyph
      rest -= amount
    }
  }
  return out
}

function toLetters(value: number): string {
  if (value <= 0) return ''
  const letter = String.fromCharCode(97 + ((value - 1) % 26))
  return letter.repeat(Math.floor((value - 1) / 26) + 1)
}

function formatNumber(value: number, format: string): string {
  switch (format) {
    case 'decimal':
      return String(value)
    case 'decimalZero':
      return value < 10 ? `0${value}` : String(value)
    case 'lowerLetter':
      return toLetters(value)
    case 'upperLetter':
      return toLetters(value).toUpperCase()
    case 'lowerRoman':
      return toRoman(value)
    case 'upperRoman':
      return toRoman(value).toUpperCase()
    case 'none':
      return ''
    default:
      throw new DocxRenderError(`List numbering in the "${format}" style is not supported.`)
  }
}

class Numbering {
  private levels = new Map<number, Level[]>()
  private counters = new Map<number, number[]>()

  constructor(numberingXml: XmlNode | undefined) {
    const root = child(numberingXml, 'w:numbering')
    const abstract = new Map<number, Level[]>()
    for (const definition of childrenNamed(root, 'w:abstractNum')) {
      const id = numberAttr(definition, 'w:abstractNumId')
      if (id == null) continue
      const levels: Level[] = []
      for (const level of childrenNamed(definition, 'w:lvl')) {
        const index = numberAttr(level, 'w:ilvl') ?? levels.length
        const suffix = attr(child(level, 'w:suff'), 'w:val')
        const align = attr(child(level, 'w:lvlJc'), 'w:val')
        levels[index] = {
          start: numberAttr(child(level, 'w:start'), 'w:val') ?? 1,
          format: attr(child(level, 'w:numFmt'), 'w:val') || 'decimal',
          text: attr(child(level, 'w:lvlText'), 'w:val') ?? '',
          suffix: suffix === 'space' ? 'space' : suffix === 'nothing' ? 'nothing' : 'tab',
          align: align === 'right' || align === 'end' ? 'right' : align === 'center' ? 'center' : 'left',
          para: readPara(child(level, 'w:pPr')),
          run: readRunProps(child(level, 'w:rPr')),
        }
      }
      abstract.set(id, levels)
    }
    for (const instance of childrenNamed(root, 'w:num')) {
      const id = numberAttr(instance, 'w:numId')
      const abstractId = numberAttr(child(instance, 'w:abstractNumId'), 'w:val')
      if (id == null || abstractId == null) continue
      if (childrenNamed(instance, 'w:lvlOverride').length) {
        throw new DocxRenderError('List numbering with level overrides is not supported.')
      }
      this.levels.set(id, abstract.get(abstractId) || [])
    }
  }

  level(numId: number, ilvl: number): Level | undefined {
    return this.levels.get(numId)?.[ilvl]
  }

  /** Counts the paragraph and returns its label text. */
  next(numId: number, ilvl: number): string {
    const levels = this.levels.get(numId) || []
    const level = levels[ilvl]
    if (!level) return ''
    let counters = this.counters.get(numId)
    if (!counters) {
      counters = levels.map((item) => (item ? item.start - 1 : 0))
      this.counters.set(numId, counters)
    }
    counters[ilvl] = (counters[ilvl] ?? level.start - 1) + 1
    for (let deeper = ilvl + 1; deeper < levels.length; deeper += 1) {
      if (levels[deeper]) counters[deeper] = levels[deeper].start - 1
    }
    if (level.format === 'bullet') return level.text
    const values = counters
    return level.text.replace(/%(\d)/g, (_, digit: string) => {
      const index = Number(digit) - 1
      const source = levels[index]
      if (!source) return ''
      // A level above that has not been used yet shows its start value, as Word does.
      return formatNumber(Math.max(values[index] ?? 0, source.start), source.format)
    })
  }
}

// ---------------------------------------------------------------- blocks

interface Context {
  styles: Styles
  numbering: Numbering
  /** Where the content sits; anchored frames are only allowed in headers and footers. */
  part: 'body' | 'header' | 'footer'
}

function tabStops(raw: Array<{ val: string; pos: number }>): TabStop[] {
  const stops = new Map<number, TabStop>()
  for (const tab of raw) {
    if (tab.val === 'clear') {
      stops.delete(tab.pos)
      continue
    }
    if (tab.val === 'bar') continue
    const align = tab.val === 'right' || tab.val === 'end' ? 'right' : tab.val === 'center' ? 'center' : tab.val === 'decimal' ? 'decimal' : 'left'
    stops.set(tab.pos, { pos: twips(tab.pos), align })
  }
  return [...stops.values()].filter((stop) => stop.pos > 0).sort((a, b) => a.pos - b.pos)
}

function readFrame(drawing: XmlNode, context: Context): TextFrame {
  const anchor = child(drawing, 'wp:anchor')
  if (!anchor) throw new DocxRenderError('Inline pictures are not supported in the agreement.')
  const shape = child(child(child(anchor, 'a:graphic'), 'a:graphicData'), 'wps:wsp')
  const box = child(child(shape, 'wps:txbx'), 'w:txbxContent')
  if (!shape || !box) throw new DocxRenderError('Pictures and shapes other than text boxes are not supported in the agreement.')
  const position = (name: string): FramePosition => {
    const node = child(anchor, name)
    const offset = child(node, 'wp:posOffset')?.children[0]?.text
    return {
      relative: attr(node, 'relativeFrom') || 'margin',
      align: child(node, 'wp:align')?.children[0]?.text,
      offset: offset ? Number(offset) / EMU_PER_POINT : 0,
    }
  }
  const extent = child(anchor, 'wp:extent')
  const body = child(shape, 'wps:bodyPr')
  return {
    x: position('wp:positionH'),
    y: position('wp:positionV'),
    width: (numberAttr(extent, 'cx') ?? 0) / EMU_PER_POINT,
    height: (numberAttr(extent, 'cy') ?? 0) / EMU_PER_POINT,
    insetLeft: (numberAttr(body, 'lIns') ?? 91440) / EMU_PER_POINT,
    insetTop: (numberAttr(body, 'tIns') ?? 45720) / EMU_PER_POINT,
    blocks: readBlocks(box, { ...context }),
  }
}

/** Text, tabs and fields of a paragraph, with each run's formatting resolved. */
function readInlines(
  paragraph: XmlNode,
  context: Context,
  runBase: RunStyle,
  frames: TextFrame[],
): Inline[] {
  const inlines: Inline[] = []
  // Field state: Word stores the last displayed result between "separate" and "end".
  const fields: Array<{ instruction: string; showResult: boolean; live?: 'PAGE' | 'NUMPAGES'; inResult: boolean }> = []
  const showing = () => fields.every((field) => !field.inResult || field.showResult)

  const visit = (node: XmlNode) => {
    switch (node.name) {
      case 'w:r':
        visitRun(node)
        return
      case 'w:hyperlink':
      case 'w:smartTag':
      case 'w:ins':
      case 'w:customXml':
        node.children.forEach(visit)
        return
      case 'w:fldSimple':
        throw new DocxRenderError('Simple fields are not supported in the agreement.')
      case 'w:sdt':
        node.children.filter((item) => item.name === 'w:sdtContent').forEach((item) => item.children.forEach(visit))
        return
      case 'w:del':
      case 'w:moveFrom':
        throw new DocxRenderError('The agreement contains tracked deletions. Accept or reject the tracked changes in the master first.')
      case 'w:pPr':
      case 'w:bookmarkStart':
      case 'w:bookmarkEnd':
      case 'w:proofErr':
      case 'w:permStart':
      case 'w:permEnd':
      case 'w:commentRangeStart':
      case 'w:commentRangeEnd':
      case '#text':
        return
      default:
        throw new DocxRenderError(`The agreement contains Word content (${node.name}) that the PDF renderer does not support.`)
    }
  }

  const visitRun = (run: XmlNode) => {
    const rPr = child(run, 'w:rPr')
    const style = applyRun(runBase, context.styles.character(attr(child(rPr, 'w:rStyle'), 'w:val')), readRunProps(rPr))
    for (const item of run.children) {
      switch (item.name) {
        case 'w:rPr':
        case 'w:lastRenderedPageBreak':
        case 'w:softHyphen':
        case '#text':
          break
        case 'w:t':
          if (showing()) {
            const text = item.children.map((node) => node.text || '').join('')
            if (text) inlines.push({ kind: 'text', text: text.replace(/\u00AD/g, ''), style })
          }
          break
        case 'w:tab':
          if (showing()) inlines.push({ kind: 'tab', style })
          break
        case 'w:br':
        case 'w:cr': {
          const type = attr(item, 'w:type')
          if (type === 'page' || type === 'column') throw new DocxRenderError('Page breaks inside a paragraph are not supported in the agreement.')
          if (showing()) inlines.push({ kind: 'break', style })
          break
        }
        case 'w:noBreakHyphen':
          if (showing()) inlines.push({ kind: 'text', text: '\u2011', style })
          break
        case 'w:sym': {
          const code = parseInt(attr(item, 'w:char') || '', 16)
          if (Number.isFinite(code) && showing()) inlines.push({ kind: 'text', text: String.fromCharCode(code >= 0xf000 ? code - 0xf000 : code), style })
          break
        }
        case 'w:fldChar': {
          const type = attr(item, 'w:fldCharType')
          if (type === 'begin') fields.push({ instruction: '', showResult: true, inResult: false })
          else if (type === 'separate') {
            const field = fields[fields.length - 1]
            if (field) {
              const name = field.instruction.trim().split(/\s+/)[0]?.toUpperCase()
              if (name === 'PAGE' || name === 'NUMPAGES') {
                field.live = name
                field.showResult = false
                if (fields.slice(0, -1).every((outer) => !outer.inResult || outer.showResult)) inlines.push({ kind: 'field', field: name, style })
              }
              field.inResult = true
            }
          } else if (type === 'end') fields.pop()
          break
        }
        case 'w:instrText': {
          const field = fields[fields.length - 1]
          if (field) field.instruction += item.children.map((node) => node.text || '').join('')
          break
        }
        case 'mc:AlternateContent': {
          const drawing = child(child(item, 'mc:Choice'), 'w:drawing')
          if (!drawing) throw new DocxRenderError('The agreement contains a drawing the PDF renderer does not support.')
          if (context.part === 'body') throw new DocxRenderError('Text boxes in the body of the agreement are not supported.')
          frames.push(readFrame(drawing, context))
          break
        }
        case 'w:drawing':
          if (context.part === 'body') throw new DocxRenderError('Pictures in the body of the agreement are not supported.')
          frames.push(readFrame(item, context))
          break
        default:
          throw new DocxRenderError(`The agreement contains Word content (${item.name}) that the PDF renderer does not support.`)
      }
    }
  }
  paragraph.children.forEach(visit)
  return inlines
}


function readParagraph(node: XmlNode, context: Context): Paragraph {
  const pPr = child(node, 'w:pPr')
  const direct = readPara(pPr)
  const styleId = direct.styleId || context.styles.defaultParagraphStyle
  const style = context.styles.paragraph(styleId)
  const fromStyle = mergePara(context.styles.defaultPara, style.para)

  const numId = direct.numId ?? fromStyle.numId
  const ilvl = direct.ilvl ?? (direct.numId != null ? 0 : fromStyle.ilvl) ?? 0
  const level = numId ? context.numbering.level(numId, ilvl) : undefined
  const resolved = mergePara(mergePara(fromStyle, level?.para || emptyPara()), direct)

  const runBase = applyRun(BASE_RUN, context.styles.defaultRun, style.run)
  const mark = applyRun(runBase, readRunProps(child(pPr, 'w:rPr')))
  // An indent given in characters counts the characters of the paragraph style's font.
  const charUnit = runBase.size

  const ind = resolved.ind
  let left = ind.leftChars != null ? (ind.leftChars * charUnit) / 100 : twips(ind.left)
  const right = ind.rightChars != null ? (ind.rightChars * charUnit) / 100 : twips(ind.right)
  let firstLine: number
  if (ind.hangingChars) {
    // A hanging indent in characters keeps the first line at the left
    // indent and moves the lines after it in, as LibreOffice reads it.
    const hanging = (ind.hangingChars * charUnit) / 100
    left += hanging
    firstLine = -hanging
  } else if (ind.firstLineChars) {
    firstLine = (ind.firstLineChars * charUnit) / 100
  } else if (ind.hanging) {
    firstLine = -twips(ind.hanging)
  } else {
    firstLine = twips(ind.firstLine)
  }

  const spacing = resolved.spacing
  const lineRule = spacing.lineRule === 'exact' ? 'exact' : spacing.lineRule === 'atLeast' ? 'atLeast' : 'auto'
  const lineValue = spacing.line ?? 240
  const jc = resolved.jc
  const frames: TextFrame[] = []
  const inlines = readInlines(node, context, runBase, frames)

  let label: ListLabel | undefined
  if (numId && level) {
    const text = context.numbering.next(numId, ilvl)
    if (text || level.suffix !== 'nothing') {
      label = { text, style: applyRun(mark, level.run), suffix: level.suffix, align: level.align }
    }
  }

  return {
    kind: 'paragraph',
    styleId,
    align: jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' || jc === 'distribute' ? 'both' : 'left',
    left,
    right,
    firstLine,
    before: spacing.beforeAutospacing ? 14 : twips(spacing.before),
    after: spacing.afterAutospacing ? 14 : twips(spacing.after),
    line: { rule: lineRule, value: lineRule === 'auto' ? lineValue / 240 : twips(lineValue) },
    keepNext: Boolean(resolved.keepNext),
    keepLines: Boolean(resolved.keepLines),
    pageBreakBefore: Boolean(resolved.pageBreakBefore),
    widowControl: Boolean(resolved.widowControl),
    tabs: tabStops(resolved.tabs),
    inlines,
    mark,
    styleRun: runBase,
    label,
    frames,
  }
}

function readBorder(node: XmlNode | undefined): Border | undefined {
  if (!node) return undefined
  const value = attr(node, 'w:val')
  if (!value || value === 'nil' || value === 'none') return undefined
  if (value !== 'single' && value !== 'thick') throw new DocxRenderError(`Table borders in the "${value}" style are not supported.`)
  const color = attr(node, 'w:color')
  return { width: Math.max(0.25, (numberAttr(node, 'w:sz') ?? 4) / 8), color: !color || color === 'auto' ? '000000' : color }
}

function readTable(node: XmlNode, context: Context, compatibilityMode: number): Table {
  const tblPr = child(node, 'w:tblPr')
  if (child(tblPr, 'w:tblStyle')) throw new DocxRenderError('Table styles are not supported in the agreement.')
  const margins = child(tblPr, 'w:tblCellMar')
  // Word's built-in table style gives cells 0.19 cm of padding left and right.
  const margin = (names: string[], fallback: number) => {
    const side = names.map((name) => child(margins, name)).find(Boolean)
    return side ? twips(numberAttr(side, 'w:w')) : fallback
  }
  const defaults = {
    left: margin(['w:left', 'w:start'], 5.4),
    right: margin(['w:right', 'w:end'], 5.4),
    top: margin(['w:top'], 0),
    bottom: margin(['w:bottom'], 0),
  }
  const tableBorders = child(tblPr, 'w:tblBorders')
  if (tableBorders && tableBorders.children.some((side) => readBorder(side))) {
    throw new DocxRenderError('Table-wide borders are not supported in the agreement; borders must be set on the cells.')
  }
  const grid = childrenNamed(child(node, 'w:tblGrid'), 'w:gridCol').map((column) => twips(numberAttr(column, 'w:w')))
  const rows: TableRow[] = childrenNamed(node, 'w:tr').map((row) => {
    const trPr = child(row, 'w:trPr')
    const height = child(trPr, 'w:trHeight')
    const rule = attr(height, 'w:hRule')
    let column = 0
    const cells: TableCell[] = childrenNamed(row, 'w:tc').map((cell) => {
      const tcPr = child(cell, 'w:tcPr')
      if (child(tcPr, 'w:vMerge') || child(tcPr, 'w:hMerge')) throw new DocxRenderError('Merged table cells are not supported in the agreement.')
      const span = numberAttr(child(tcPr, 'w:gridSpan'), 'w:val') ?? 1
      const width = grid.slice(column, column + span).reduce((sum, value) => sum + value, 0) || twips(numberAttr(child(tcPr, 'w:tcW'), 'w:w'))
      column += span
      const own = child(tcPr, 'w:tcMar')
      const ownMargin = (name: string, fallback: number) => {
        const side = child(own, name)
        return side ? twips(numberAttr(side, 'w:w')) : fallback
      }
      const borders = child(tcPr, 'w:tcBorders')
      const fill = attr(child(tcPr, 'w:shd'), 'w:fill')
      const vAlign = attr(child(tcPr, 'w:vAlign'), 'w:val')
      return {
        width,
        marginLeft: ownMargin('w:left', defaults.left),
        marginRight: ownMargin('w:right', defaults.right),
        marginTop: ownMargin('w:top', defaults.top),
        marginBottom: ownMargin('w:bottom', defaults.bottom),
        borders: {
          top: readBorder(child(borders, 'w:top')),
          left: readBorder(child(borders, 'w:left') ?? child(borders, 'w:start')),
          bottom: readBorder(child(borders, 'w:bottom')),
          right: readBorder(child(borders, 'w:right') ?? child(borders, 'w:end')),
        },
        fill: fill && fill !== 'auto' ? fill : undefined,
        verticalAlign: vAlign === 'center' ? 'center' : vAlign === 'bottom' ? 'bottom' : 'top',
        blocks: readBlocks(cell, context, compatibilityMode),
      }
    })
    return {
      cells,
      height: twips(numberAttr(height, 'w:val')),
      heightRule: !height ? 'auto' : rule === 'exact' ? 'exact' : rule === 'auto' ? 'auto' : 'atLeast',
      cantSplit: Boolean(onOff(child(trPr, 'w:cantSplit'))),
    }
  })
  const width = grid.reduce((sum, value) => sum + value, 0)
  const indent = twips(numberAttr(child(tblPr, 'w:tblInd'), 'w:w'))
  // Before Word 2013 the table indent measures to the text of the first cell, not its border.
  const firstMargin = rows[0]?.cells[0]?.marginLeft ?? defaults.left
  const jc = attr(child(tblPr, 'w:jc'), 'w:val')
  if (jc === 'center' || jc === 'right' || jc === 'end') throw new DocxRenderError('Centred or right-aligned tables are not supported in the agreement.')
  return { kind: 'table', left: compatibilityMode >= 15 ? indent : indent - firstMargin, width, rows }
}

function readBlocks(container: XmlNode, context: Context, compatibilityMode = 15): Block[] {
  const blocks: Block[] = []
  for (const node of container.children) {
    if (node.name === 'w:p') blocks.push(readParagraph(node, context))
    else if (node.name === 'w:tbl') blocks.push(readTable(node, context, compatibilityMode))
    else if (node.name === 'w:sdt') blocks.push(...readBlocks(child(node, 'w:sdtContent') || { name: '', attrs: {}, children: [] }, context, compatibilityMode))
    else if (['w:sectPr', 'w:bookmarkStart', 'w:bookmarkEnd', 'w:proofErr', 'w:tcPr', '#text'].includes(node.name)) continue
    else throw new DocxRenderError(`The agreement contains Word content (${node.name}) that the PDF renderer does not support.`)
  }
  return blocks
}

// ---------------------------------------------------------------- package

function part(zip: PizZip, name: string): XmlNode | undefined {
  const file = zip.file(name)
  return file ? parseXml(file.asText()) : undefined
}

function relationshipTargets(zip: PizZip): Map<string, string> {
  const rels = child(part(zip, 'word/_rels/document.xml.rels'), 'Relationships')
  const map = new Map<string, string>()
  for (const rel of childrenNamed(rels, 'Relationship')) {
    const id = attr(rel, 'Id')
    const target = attr(rel, 'Target')
    if (id && target) map.set(id, target.startsWith('/') ? target.slice(1) : `word/${target}`)
  }
  return map
}

export function readDocument(docx: Buffer | Uint8Array): DocumentModel {
  let zip: PizZip
  try {
    zip = new PizZip(docx)
  } catch {
    throw new DocxRenderError('The agreement is not a valid Word file.')
  }
  const documentXml = part(zip, 'word/document.xml')
  const body = child(child(documentXml, 'w:document'), 'w:body')
  if (!body) throw new DocxRenderError('The agreement has no document body.')
  const settings = child(part(zip, 'word/settings.xml'), 'w:settings')
  const compat = childrenNamed(child(settings, 'w:compat'), 'w:compatSetting').find((item) => attr(item, 'w:name') === 'compatibilityMode')
  const compatibilityMode = Number(attr(compat, 'w:val') || 15)
  const defaultTab = numberAttr(child(settings, 'w:defaultTabStop'), 'w:val')
  if (defaultTab != null && defaultTab !== 720) throw new DocxRenderError('Only the standard half-inch default tab stops are supported.')
  if (child(settings, 'w:evenAndOddHeaders')) throw new DocxRenderError('Different headers on odd and even pages are not supported.')

  const sections = body.children.filter((node) => node.name === 'w:p' && child(child(node, 'w:pPr'), 'w:sectPr'))
  if (sections.length) throw new DocxRenderError('The agreement has more than one section, which the PDF renderer does not support.')
  const sectPr = child(body, 'w:sectPr')
  if (child(sectPr, 'w:titlePg')) throw new DocxRenderError('A different first-page header is not supported.')
  if (child(sectPr, 'w:cols') && (numberAttr(child(sectPr, 'w:cols'), 'w:num') ?? 1) > 1) throw new DocxRenderError('Multiple text columns are not supported.')
  const size = child(sectPr, 'w:pgSz')
  const margins = child(sectPr, 'w:pgMar')
  const page: PageSetup = {
    width: twips(numberAttr(size, 'w:w') ?? 11906),
    height: twips(numberAttr(size, 'w:h') ?? 16838),
    marginLeft: twips(numberAttr(margins, 'w:left') ?? 1440),
    marginRight: twips(numberAttr(margins, 'w:right') ?? 1440),
    marginTop: twips(numberAttr(margins, 'w:top') ?? 1440),
    marginBottom: twips(numberAttr(margins, 'w:bottom') ?? 1440),
    headerDistance: twips(numberAttr(margins, 'w:header') ?? 720),
    footerDistance: twips(numberAttr(margins, 'w:footer') ?? 720),
  }
  if (attr(size, 'w:orient') === 'landscape') throw new DocxRenderError('Landscape pages are not supported.')

  const styles = new Styles(part(zip, 'word/styles.xml'))
  const numbering = new Numbering(part(zip, 'word/numbering.xml'))
  const targets = relationshipTargets(zip)
  const reference = (name: string, root: string, kind: 'header' | 'footer'): Block[] => {
    const refs = childrenNamed(sectPr, name)
    if (refs.some((ref) => attr(ref, 'w:type') && attr(ref, 'w:type') !== 'default')) {
      throw new DocxRenderError(`Only a single ${kind} for every page is supported.`)
    }
    const id = refs[0] ? attr(refs[0], 'r:id') : undefined
    const target = id ? targets.get(id) : undefined
    const xml = target ? child(part(zip, target), root) : undefined
    return xml ? readBlocks(xml, { styles, numbering, part: kind }, compatibilityMode) : []
  }

  return {
    page,
    body: readBlocks(body, { styles, numbering, part: 'body' }, compatibilityMode),
    header: reference('w:headerReference', 'w:hdr', 'header'),
    footer: reference('w:footerReference', 'w:ftr', 'footer'),
  }
}
