/**
 * Reads a PDF back into lines of text with their page and baseline. Used by
 * the agreement tests and scripts/compare-agreement-pdf.ts to check the PDF
 * against the Word file and against an office renderer; the app never loads it.
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

export interface PdfLine {
  page: number
  /** Baseline, in points down from the top of the page. */
  y: number
  /** Left edge of the first word. */
  x: number
  /** The line's text with all white space removed. */
  text: string
}

export interface PdfText {
  pages: number
  width: number
  height: number
  lines: PdfLine[]
  /** Every text item, for checks on where text sits. */
  items: Array<{ page: number; x: number; y: number; width: number; text: string }>
}

// Lines of the agreement are at least 13 pt apart; a superscript sits 5 pt above its baseline.
const SAME_LINE = 6

export async function readPdfText(pdf: Uint8Array): Promise<PdfText> {
  const doc = await getDocument({ data: new Uint8Array(pdf), disableFontFace: true, useSystemFonts: false }).promise
  const lines: PdfLine[] = []
  const items: PdfText['items'] = []
  let width = 0
  let height = 0
  for (let number = 1; number <= doc.numPages; number += 1) {
    const page = await doc.getPage(number)
    const view = page.getViewport({ scale: 1 })
    width = view.width
    height = view.height
    const content = await page.getTextContent()
    const placed = content.items
      .filter((item): item is typeof item & { str: string; transform: number[]; width: number } => 'str' in item)
      .map((item) => ({ page: number, x: item.transform[4], y: view.height - item.transform[5], width: item.width, text: item.str }))
      .filter((item) => item.text.length > 0)
    items.push(...placed)
    const visible = placed.filter((item) => item.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x)
    const clusters: Array<typeof visible> = []
    for (const item of visible) {
      const cluster = clusters[clusters.length - 1]
      // The largest baseline in a cluster is the line itself; raised superscripts sit above it.
      if (cluster && item.y - Math.max(...cluster.map((member) => member.y)) < SAME_LINE && Math.max(...cluster.map((member) => member.y)) - item.y < SAME_LINE) cluster.push(item)
      else clusters.push([item])
    }
    for (const cluster of clusters) {
      cluster.sort((a, b) => a.x - b.x)
      lines.push({
        page: number,
        y: Math.max(...cluster.map((member) => member.y)),
        x: cluster[0].x,
        text: cluster.map((member) => member.text).join('').replace(/\s+/g, ''),
      })
    }
  }
  await doc.destroy()
  return { pages: doc.numPages, width, height, lines, items }
}

/** The page-number footer, which the office renderer and the PDF both add on every page. */
export function isFooter(line: PdfLine): boolean {
  return /^Page\d+of\d+$/.test(line.text)
}

export interface Comparison {
  pages: { pdf: number; reference: number }
  lines: { pdf: number; reference: number }
  /** Lines with the same text in both, matched in order: the line breaks agree. */
  sameLines: number
  /** Of those, lines on the same page within half a point of the same baseline. */
  samePlace: number
  largestShift: number
  /** All the text, in reading order, is the same. */
  sameText: boolean
  differences: Array<{ reference: string[]; pdf: string[]; page: number }>
}

/** Line-by-line comparison of the PDF with an office renderer's PDF of the same Word file. */
export function compareLines(pdf: PdfText, reference: PdfText): Comparison {
  const a = reference.lines.filter((line) => !isFooter(line))
  const b = pdf.lines.filter((line) => !isFooter(line))
  // Longest common subsequence of line texts.
  const rows = a.length + 1
  const cols = b.length + 1
  const table = new Uint16Array(rows * cols)
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] = a[i].text === b[j].text ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1])
    }
  }
  let i = 0
  let j = 0
  let samePlace = 0
  let largestShift = 0
  const differences: Comparison['differences'] = []
  let pending: Comparison['differences'][number] | null = null
  const flush = () => {
    if (pending && (pending.reference.length || pending.pdf.length)) differences.push(pending)
    pending = null
  }
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i].text === b[j].text) {
      flush()
      const shift = a[i].page === b[j].page ? Math.abs(a[i].y - b[j].y) : Infinity
      if (shift <= 0.5) samePlace += 1
      else if (Number.isFinite(shift)) largestShift = Math.max(largestShift, shift)
      i += 1
      j += 1
      continue
    }
    pending ??= { reference: [], pdf: [], page: (a[i] ?? b[j]).page }
    if (j < b.length && (i >= a.length || table[i * cols + j + 1] >= table[(i + 1) * cols + j])) pending.pdf.push(b[j++].text)
    else pending.reference.push(a[i++].text)
  }
  flush()
  return {
    pages: { pdf: pdf.pages, reference: reference.pages },
    lines: { pdf: b.length, reference: a.length },
    sameLines: table[0],
    samePlace,
    largestShift: Math.round(largestShift * 100) / 100,
    sameText: a.map((line) => line.text).join('') === b.map((line) => line.text).join(''),
    differences,
  }
}

const OFFICE = [
  process.env.SOFFICE_PATH,
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
  '/usr/local/bin/soffice',
  '/usr/lib/libreoffice/program/soffice',
].filter((candidate): candidate is string => Boolean(candidate))

/** A locally installed LibreOffice, used only as the reference renderer in checks. */
export async function findOffice(): Promise<string | null> {
  const { access } = await import('fs/promises')
  for (const candidate of OFFICE) {
    try {
      await access(candidate)
      return candidate
    } catch {
      continue
    }
  }
  return null
}

export async function officePdf(office: string, docx: Uint8Array): Promise<Buffer> {
  const { mkdtemp, readFile, rm, writeFile } = await import('fs/promises')
  const os = await import('os')
  const path = await import('path')
  const { execFile } = await import('child_process')
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agreement-reference-'))
  try {
    await writeFile(path.join(dir, 'agreement.docx'), docx)
    await new Promise<void>((resolve, reject) => {
      execFile(
        office,
        ['--headless', '--norestore', `-env:UserInstallation=file://${path.join(dir, 'profile')}`, '--convert-to', 'pdf', '--outdir', dir, path.join(dir, 'agreement.docx')],
        { timeout: 120_000 },
        (error) => (error ? reject(error) : resolve())
      )
    })
    return await readFile(path.join(dir, 'agreement.pdf'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
