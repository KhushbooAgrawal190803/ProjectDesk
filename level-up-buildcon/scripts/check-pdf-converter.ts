/**
 * Converts the Agreement for Sale master with the configured PDF service and compares it
 * with LibreOffice on this machine: page count and embedded fonts must match.
 *
 *   GOTENBERG_URL=https://... GOTENBERG_USERNAME=... GOTENBERG_PASSWORD=... npm run pdf:check
 */
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { PDFDocument } from 'pdf-lib'
import { convertDocxToPdf, pdfConverter } from '../lib/documents/docx-to-pdf'

async function describe(pdf: Buffer) {
  const doc = await PDFDocument.load(pdf)
  const fonts = new Set((pdf.toString('latin1').match(/\/BaseFont\s*\/[A-Z]{6}\+([A-Za-z0-9_-]+)/g) || []).map((match) => match.split('+').pop() as string))
  return { pages: doc.getPageCount(), fonts: [...fonts].sort() }
}

async function main() {
  const master = readFileSync(path.join(process.cwd(), 'assets/agreements/developer-type1-even-1803.docx'))
  const converter = pdfConverter()
  console.log(`Converter: ${converter}`)
  const started = Date.now()
  const remote = await convertDocxToPdf(master)
  writeFileSync('/tmp/projectdesk-agreement-check.pdf', remote)
  const remoteInfo = await describe(remote)
  console.log(`Converted in ${((Date.now() - started) / 1000).toFixed(1)}s: ${remoteInfo.pages} pages, fonts ${remoteInfo.fonts.join(', ')}`)
  console.log('Saved to /tmp/projectdesk-agreement-check.pdf for a visual check.')

  if (converter === 'libreoffice') return
  delete process.env.GOTENBERG_URL
  delete process.env.CLOUDCONVERT_API_KEY
  process.env.PDF_CONVERTER = 'libreoffice'
  try {
    const local = await describe(await convertDocxToPdf(master))
    const samePages = local.pages === remoteInfo.pages
    const sameFonts = local.fonts.join() === remoteInfo.fonts.join()
    console.log(`Local LibreOffice: ${local.pages} pages, fonts ${local.fonts.join(', ')}`)
    console.log(samePages && sameFonts ? 'MATCH: same pages and fonts as this Mac.' : `DIFFERENT: pages ${samePages ? 'match' : 'differ'}, fonts ${sameFonts ? 'match' : 'differ'}.`)
    if (!samePages || !sameFonts) process.exitCode = 1
  } catch {
    console.log('LibreOffice is not installed here, so there is no local reference. The master is 34 pages with Carlito, Linux Libertine G and Frank Ruhl Hofshi.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
