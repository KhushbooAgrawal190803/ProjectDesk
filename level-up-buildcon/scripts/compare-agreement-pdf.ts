/**
 * Writes each representative agreement as Word and PDF, and compares the PDF
 * with LibreOffice's rendering of the same Word file when LibreOffice is
 * installed: pages, line breaks, text and baselines.
 *
 *   npm run agreement:compare            (files go to /tmp/agreement-compare)
 */
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { buildAgreementDocx } from '../lib/documents/agreement'
import { agreementPdf } from '../lib/documents/agreement-pdf'
import { agreementSamples } from '../lib/documents/agreement-samples'
import { compareLines, findOffice, officePdf, readPdfText } from '../lib/documents/docx-pdf/pdf-lines'

async function main() {
  const out = process.argv[2] || '/tmp/agreement-compare'
  mkdirSync(out, { recursive: true })
  const office = await findOffice()
  if (!office) console.log('LibreOffice is not installed, so only the Word and PDF files are written.')
  let failed = false
  for (const sample of agreementSamples()) {
    const docx = await buildAgreementDocx(sample.input)
    const started = Date.now()
    const pdf = await agreementPdf(docx)
    const took = Date.now() - started
    writeFileSync(path.join(out, `${sample.id}.docx`), docx)
    writeFileSync(path.join(out, `${sample.id}.pdf`), pdf)
    const text = await readPdfText(pdf)
    console.log(`\n${sample.id}: ${sample.description}`)
    console.log(`  PDF: ${text.pages} pages, ${(pdf.length / 1024).toFixed(0)} KB, set in ${took} ms`)
    if (!office) continue
    const reference = await officePdf(office, docx)
    writeFileSync(path.join(out, `${sample.id}.libreoffice.pdf`), reference)
    const result = compareLines(text, await readPdfText(reference))
    console.log(`  LibreOffice: ${result.pages.reference} pages`)
    console.log(`  Same text in reading order: ${result.sameText ? 'yes' : 'NO'}`)
    console.log(`  Same line breaks: ${result.sameLines} of ${result.lines.reference} lines`)
    console.log(`  Same page and baseline (within 0.5 pt): ${result.samePlace} lines; largest shift ${result.largestShift} pt`)
    for (const difference of result.differences.slice(0, 5)) {
      console.log(`  Differs on page ${difference.page}:\n    LibreOffice: ${difference.reference.join(' | ')}\n    PDF:         ${difference.pdf.join(' | ')}`)
    }
    if (!result.sameText || result.pages.pdf !== result.pages.reference || result.differences.length) failed = true
  }
  console.log(`\nFiles are in ${out}`)
  if (failed) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
