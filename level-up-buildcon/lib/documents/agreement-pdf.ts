import { DocxRenderError } from '@/lib/documents/docx-pdf/model'
import { renderDocxToPdf } from '@/lib/documents/docx-pdf/render'

/**
 * The Agreement for Sale as a PDF. It is set from the generated Word file
 * itself, so the PDF carries exactly the Word file's text and figures. Runs
 * in the Node.js runtime with fonts from assets/fonts; no conversion service
 * or office software is involved.
 */
export class AgreementPdfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgreementPdfError'
  }
}

export async function agreementPdf(docx: Buffer): Promise<Buffer> {
  try {
    return await renderDocxToPdf(docx)
  } catch (error) {
    if (error instanceof DocxRenderError) throw new AgreementPdfError(`The agreement PDF could not be created: ${error.message}`)
    throw error
  }
}
