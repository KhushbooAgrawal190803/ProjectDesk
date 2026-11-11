import PizZip from 'pizzip'

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const TEXT_NODE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g

/** Raw text of a paragraph, row or any other fragment, exactly as typed. */
export function rawText(fragment: string): string {
  return [...fragment.matchAll(TEXT_NODE)].map((match) => decodeXml(match[1])).join('')
}

/** Text with runs of white space collapsed. Used only to recognise a paragraph. */
export function paragraphText(fragment: string): string {
  return rawText(fragment).replace(/\s+/g, ' ').trim()
}

/** The master uses red only to mark sample wording. Issued text is black. */
export function printInBlack(xml: string): string {
  return xml.replace(/<w:color\b[^>]*\/>/g, '<w:color w:val="000000"/>')
}

export class TemplateMismatch extends Error {
  constructor(what: string) {
    super(`The agreement template no longer matches the expected wording (${what}).`)
    this.name = 'TemplateMismatch'
  }
}

interface TextSlot {
  from: number
  to: number
  text: string
}

function textSlots(fragment: string): TextSlot[] {
  return [...fragment.matchAll(TEXT_NODE)].map((match) => ({
    from: match.index ?? 0,
    to: (match.index ?? 0) + match[0].length,
    text: decodeXml(match[1]),
  }))
}

function boldRun(fragment: string, slotStart: number): string {
  const runStart = Math.max(fragment.lastIndexOf('<w:r>', slotStart), fragment.lastIndexOf('<w:r ', slotStart))
  if (runStart < 0) return fragment
  const head = fragment.slice(0, runStart)
  const run = fragment.slice(runStart, slotStart)
  if (/<w:b\/>/.test(run)) return fragment
  const bolded = run.includes('<w:rPr>')
    ? run.replace('<w:rPr>', '<w:rPr><w:b/><w:bCs/>')
    : run.replace(/^<w:r(\s[^>]*)?>/, (open) => `${open}<w:rPr><w:b/><w:bCs/></w:rPr>`)
  return head + bolded + fragment.slice(slotStart)
}

/**
 * Replaces one stretch of text and leaves every Word run where it is, so the
 * font, weight, superscript and spacing of the master carry over. The new
 * text lands in the first run the old text touched.
 */
export function replaceText(
  fragment: string,
  pattern: RegExp | string,
  replacement: string,
  options: { what?: string; bold?: boolean } = {}
): string {
  const slots = textSlots(fragment)
  const full = slots.map((slot) => slot.text).join('')
  let start = -1
  let length = 0
  if (typeof pattern === 'string') {
    start = full.indexOf(pattern)
    length = pattern.length
  } else {
    const match = new RegExp(pattern.source, pattern.flags.replace('g', '')).exec(full)
    if (match) {
      start = match.index
      length = match[0].length
    }
  }
  if (start < 0 || length === 0) throw new TemplateMismatch(options.what || String(pattern))
  const end = start + length

  let cursor = 0
  let placed = false
  let firstSlot = -1
  const rewritten = slots.map((slot, index) => {
    const slotStart = cursor
    const slotEnd = cursor + slot.text.length
    cursor = slotEnd
    const from = Math.max(slotStart, start)
    const to = Math.min(slotEnd, end)
    if (from >= to) return null
    const before = slot.text.slice(0, from - slotStart)
    const after = slot.text.slice(to - slotStart)
    const insert = placed ? '' : replacement
    if (!placed) firstSlot = index
    placed = true
    return `<w:t xml:space="preserve">${escapeXml(before + insert + after)}</w:t>`
  })

  let out = fragment
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    const next = rewritten[index]
    if (next == null) continue
    out = out.slice(0, slots[index].from) + next + out.slice(slots[index].to)
  }
  if (options.bold && firstSlot >= 0) out = boldRun(out, slots[firstSlot].from)
  return out
}

/** The runs of a paragraph, with the opening tag and paragraph properties kept apart. */
export function paragraphRuns(paragraphXml: string): { head: string; runs: string[]; tail: string } {
  const open = paragraphXml.match(/^<w:p\b[^>]*>/)?.[0] || '<w:p>'
  const pPr = paragraphXml.match(/^<w:p\b[^>]*>(<w:pPr>[\s\S]*?<\/w:pPr>)/)?.[1] || ''
  const body = paragraphXml.slice(open.length + pPr.length, paragraphXml.length - '</w:p>'.length)
  const runs = body.match(/<w:r[ >][\s\S]*?<\/w:r>/g) || []
  return { head: open + pPr, runs, tail: '</w:p>' }
}

/** A run that copies the character formatting of an existing run. */
export function runLike(modelRun: string, text: string, options: { bold?: boolean } = {}): string {
  let rPr = modelRun.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || ''
  if (options.bold && !/<w:b\/>/.test(rPr)) {
    rPr = rPr ? rPr.replace('<w:rPr>', '<w:rPr><w:b/><w:bCs/>') : '<w:rPr><w:b/><w:bCs/></w:rPr>'
  }
  return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`
}

export function splitParagraphs(xml: string): { glue: string[]; parts: string[] } {
  const expression = /<w:p[ >][\s\S]*?<\/w:p>/g
  const glue: string[] = []
  const parts: string[] = []
  let last = 0
  for (const match of xml.matchAll(expression)) {
    const index = match.index ?? 0
    glue.push(xml.slice(last, index))
    parts.push(match[0])
    last = index + match[0].length
  }
  glue.push(xml.slice(last))
  return { glue, parts }
}

export function joinParagraphs(glue: string[], parts: string[]): string {
  let xml = ''
  parts.forEach((part, index) => {
    xml += glue[index] + part
  })
  return xml + glue[glue.length - 1]
}

export function readDocumentXml(docx: Buffer): { zip: PizZip; xml: string } {
  const zip = new PizZip(docx)
  const file = zip.file('word/document.xml')
  if (!file) throw new Error('The agreement template has no document body.')
  return { zip, xml: file.asText() }
}

export function writeDocumentXml(zip: PizZip, xml: string): Buffer {
  zip.file('word/document.xml', xml)
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer
}
