import type PizZip from 'pizzip'
import { rawText } from '@/lib/documents/docx-fill'

/**
 * Page layout only. Nothing here adds, removes or rewords text: it tells the
 * page where it may and may not break, so tables, headings and the signature
 * page hold together however long the filled details run.
 */

type Rule = 'keepNext' | 'pageBreakBefore'

// The order Word expects inside paragraph properties.
const ORDER: Rule[] = ['keepNext', 'pageBreakBefore']

function withRules(paragraph: string, rules: Rule[]): string {
  if (!paragraph) return paragraph
  const open = paragraph.match(/^<w:p\b[^>]*>/)?.[0]
  if (!open) return paragraph
  const rest = paragraph.slice(open.length)
  const hasProperties = rest.startsWith('<w:pPr>')
  const end = hasProperties ? rest.indexOf('</w:pPr>') : -1
  let properties = hasProperties ? rest.slice('<w:pPr>'.length, end) : ''
  const body = hasProperties ? rest.slice(end + '</w:pPr>'.length) : rest

  const style = properties.match(/^<w:pStyle\b[^>]*\/>/)?.[0] || ''
  properties = properties.slice(style.length)
  const wanted = ORDER.filter((rule) => rules.includes(rule) || properties.includes(`<w:${rule}/>`))
  for (const rule of ORDER) properties = properties.replace(`<w:${rule}/>`, '')
  const tags = wanted.map((rule) => `<w:${rule}/>`).join('')
  return `${open}<w:pPr>${style}${tags}${properties}</w:pPr>${body}`
}

function isHeading(text: string): boolean {
  if (!text || text.length > 90) return false
  if (/[a-z]/.test(text) || /X{3,}/.test(text)) return false
  return /[A-Z]{3}/.test(text)
}

/**
 * Paragraph rules. `masterTexts` is the wording of each paragraph before it
 * was filled, so a rule is chosen by the master and never by a customer name.
 * `parts` is edited in place; an entry may hold more than one paragraph.
 */
export function holdParagraphsTogether(glue: string[], parts: string[], masterTexts: string[]): void {
  const witness = masterTexts.findIndex((text) => text.startsWith('IN WITNESS WHEREOF'))
  const each = (index: number, rules: Rule[]) => {
    parts[index] = parts[index].replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (paragraph) => withRules(paragraph, rules))
  }

  let depth = 0
  masterTexts.forEach((text, index) => {
    depth += (glue[index].match(/<w:tbl>/g) || []).length - (glue[index].match(/<\/w:tbl>/g) || []).length
    if (depth > 0 || !parts[index]) return
    if (witness >= 0 && index >= witness) return
    const leadsIn =
      isHeading(text) ||
      /^(North|South|East)\s*:-/.test(text) ||
      text.includes('total lump-sum consideration') ||
      text.includes('is bifurcated as set out in the table below')
    if (leadsIn) each(index, ['keepNext'])
  })

  if (witness < 0) return

  // The master pushes the signatures to a fresh page with a run of empty
  // lines. A page break does the same job at any length of document.
  for (let index = witness - 1; index >= 0 && masterTexts[index] === ''; index -= 1) {
    if (/<w:(drawing|pict|br|sectPr)\b/.test(parts[index])) break
    parts[index] = ''
  }
  each(witness, ['keepNext', 'pageBreakBefore'])
  for (let index = witness + 1; index < parts.length - 1; index += 1) each(index, ['keepNext'])
}

// The consideration table and the payment schedule each fit on a page and are
// kept in one piece. A custom payment plan with many stages may run longer, so
// past this many rows the table is left free to break between rows.
const WHOLE_TABLE_MAX_ROWS = 20

/**
 * Rows never break across a page and every row is tall enough for its text.
 * The heading row stays with the first entry and the closing row with the one
 * before it. The two short money tables stay whole.
 */
export function holdTablesTogether(xml: string): string {
  return xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (table) => {
    const rows = table.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []
    const text = rawText(table)
    const whole = rows.length <= WHOLE_TABLE_MAX_ROWS && (text.includes('Milestone') || text.includes('Particulars'))
    let seen = 0
    return table.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (row) => {
      seen += 1
      let next = row.includes('<w:cantSplit/>')
        ? row
        : row.includes('<w:trPr>')
          ? row.replace('<w:trPr>', '<w:trPr><w:cantSplit/>')
          : row.replace(/^<w:tr\b[^>]*>/, (open) => `${open}<w:trPr><w:cantSplit/></w:trPr>`)
      // A fixed row height cuts off the lower lines of a cell in print.
      next = next.replace(/(<w:trHeight\b[^>]*w:hRule=")exact(")/, '$1atLeast$2')
      const last = seen === rows.length
      const withNext = whole ? !last : seen === 1 || seen === rows.length - 1
      if (withNext && rows.length > 1) {
        next = next.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (paragraph) => withRules(paragraph, ['keepNext']))
      }
      return next
    })
  })
}

/** No single line of a paragraph is left alone at the top or foot of a page. */
export function avoidStrayLines(zip: PizZip): void {
  const file = zip.file('word/styles.xml')
  if (!file) return
  const styles = file.asText()
  const normal = styles.match(/<w:style\b[^>]*w:styleId="Normal"[\s\S]*?<\/w:style>/)?.[0]
  if (!normal) return
  zip.file('word/styles.xml', styles.replace(normal, normal.replace('<w:widowControl w:val="false"/>', '<w:widowControl/>')))
}
