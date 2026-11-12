import { spawn } from 'child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'

/**
 * Word to PDF with LibreOffice, so the Agreement for Sale keeps the master's exact layout.
 *
 * Vercel has no LibreOffice, so production uses a LibreOffice service over HTTPS:
 * - Gotenberg (GOTENBERG_URL): LibreOffice in a container you host. Same engine and fonts as local.
 * - CloudConvert (CLOUDCONVERT_API_KEY): managed service, using its LibreOffice engine.
 * Locally, the LibreOffice app on this machine is used when neither is set.
 */

export class OfficeConversionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OfficeConversionError'
  }
}

export type PdfConverter = 'gotenberg' | 'cloudconvert' | 'libreoffice'

export function pdfConverter(): PdfConverter {
  const chosen = (process.env.PDF_CONVERTER || '').trim().toLowerCase()
  if (chosen === 'gotenberg' || chosen === 'cloudconvert' || chosen === 'libreoffice') return chosen
  if (process.env.GOTENBERG_URL) return 'gotenberg'
  if (process.env.CLOUDCONVERT_API_KEY) return 'cloudconvert'
  return 'libreoffice'
}

const TIMEOUT_MS = 90_000

function looksLikePdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString('latin1') === '%PDF-'
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, what: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await work(controller.signal)
  } catch (error) {
    if (controller.signal.aborted) throw new OfficeConversionError(`${what} took too long to create the PDF.`)
    if (error instanceof OfficeConversionError) throw error
    throw new OfficeConversionError(`${what} could not be reached: ${error instanceof Error ? error.message : 'network error'}`)
  } finally {
    clearTimeout(timer)
  }
}

/** One retry for network errors and 5xx responses; a 4xx is reported at once. */
async function retryOnce(work: () => Promise<Buffer>): Promise<Buffer> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof OfficeConversionError && /\b4\d\d\b/.test(error.message)) throw error
    await new Promise((resolve) => setTimeout(resolve, 1500))
    return work()
  }
}

async function viaGotenberg(docx: Buffer): Promise<Buffer> {
  const base = (process.env.GOTENBERG_URL || '').replace(/\/$/, '')
  if (!base) throw new OfficeConversionError('GOTENBERG_URL is not set.')
  if (process.env.VERCEL && !base.startsWith('https://')) throw new OfficeConversionError('GOTENBERG_URL must use https in production.')
  const headers: Record<string, string> = {}
  if (process.env.GOTENBERG_USERNAME && process.env.GOTENBERG_PASSWORD) {
    headers.Authorization = `Basic ${Buffer.from(`${process.env.GOTENBERG_USERNAME}:${process.env.GOTENBERG_PASSWORD}`).toString('base64')}`
  }
  return retryOnce(() =>
    withTimeout(async (signal) => {
      const form = new FormData()
      form.append('files', new Blob([new Uint8Array(docx)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'document.docx')
      const response = await fetch(`${base}/forms/libreoffice/convert`, { method: 'POST', body: form, headers, signal })
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 200)
        throw new OfficeConversionError(`The PDF service returned ${response.status}${detail ? `: ${detail}` : ''}`)
      }
      const pdf = Buffer.from(await response.arrayBuffer())
      if (!looksLikePdf(pdf)) throw new OfficeConversionError('The PDF service did not return a PDF.')
      return pdf
    }, 'The PDF service')
  )
}

interface CloudConvertTask {
  name: string
  status: string
  message?: string | null
  result?: { files?: Array<{ url?: string }> }
}

async function viaCloudConvert(docx: Buffer): Promise<Buffer> {
  const key = process.env.CLOUDCONVERT_API_KEY
  if (!key) throw new OfficeConversionError('CLOUDCONVERT_API_KEY is not set.')
  const auth = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  return retryOnce(() =>
    withTimeout(async (signal) => {
      const created = await fetch('https://api.cloudconvert.com/v2/jobs', {
        method: 'POST',
        headers: auth,
        signal,
        body: JSON.stringify({
          tasks: {
            upload: { operation: 'import/base64', file: docx.toString('base64'), filename: 'document.docx' },
            convert: { operation: 'convert', input: 'upload', input_format: 'docx', output_format: 'pdf', engine: process.env.CLOUDCONVERT_ENGINE || 'libreoffice' },
            download: { operation: 'export/url', input: 'convert' },
          },
          tag: 'projectdesk-agreement',
        }),
      })
      if (!created.ok) throw new OfficeConversionError(`CloudConvert returned ${created.status} when starting the conversion.`)
      const job = (await created.json()) as { data: { id: string } }
      // The sync endpoint answers when the job has finished.
      const waited = await fetch(`https://sync.api.cloudconvert.com/v2/jobs/${job.data.id}`, { headers: auth, signal })
      if (!waited.ok) throw new OfficeConversionError(`CloudConvert returned ${waited.status} while converting.`)
      const result = (await waited.json()) as { data: { status: string; tasks: CloudConvertTask[] } }
      const failed = result.data.tasks.find((task) => task.status === 'error')
      if (failed) throw new OfficeConversionError(`CloudConvert could not convert the agreement: ${failed.message || failed.name}`)
      const url = result.data.tasks.find((task) => task.name === 'download')?.result?.files?.[0]?.url
      if (!url) throw new OfficeConversionError('CloudConvert did not return the PDF.')
      const file = await fetch(url, { signal })
      if (!file.ok) throw new OfficeConversionError(`CloudConvert returned ${file.status} for the PDF.`)
      const pdf = Buffer.from(await file.arrayBuffer())
      if (!looksLikePdf(pdf)) throw new OfficeConversionError('CloudConvert did not return a PDF.')
      return pdf
    }, 'CloudConvert')
  )
}

const LOCAL_CANDIDATES = [
  process.env.SOFFICE_PATH,
  `${process.env.HOME || ''}/Applications/LibreOffice.app/Contents/MacOS/soffice`,
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/usr/lib/libreoffice/program/soffice',
].filter((value): value is string => Boolean(value))

async function localBinary(): Promise<string | null> {
  for (const candidate of LOCAL_CANDIDATES) {
    try {
      await access(candidate)
      return candidate
    } catch {
      continue
    }
  }
  return null
}

async function viaLocalLibreOffice(docx: Buffer): Promise<Buffer> {
  const binary = await localBinary()
  if (!binary) {
    throw new OfficeConversionError(
      process.env.VERCEL
        ? 'No PDF service is configured. Set GOTENBERG_URL (or CLOUDCONVERT_API_KEY) in the Vercel project settings.'
        : 'LibreOffice is not installed, so the PDF could not be created. Install LibreOffice in /Applications, set SOFFICE_PATH, or set GOTENBERG_URL.'
    )
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lubc-office-'))
  const profile = await mkdtemp(path.join(os.tmpdir(), 'lubc-soffice-'))
  const input = path.join(dir, 'document.docx')
  const output = path.join(dir, 'document.pdf')
  try {
    await writeFile(input, docx)
    await new Promise<void>((resolve, reject) => {
      // The ignore comment keeps Vercel from bundling the whole project into each function.
      const child = spawn(
        /* turbopackIgnore: true */ binary,
        ['--headless', '--norestore', '--nolockcheck', `-env:UserInstallation=file://${profile}`, '--convert-to', 'pdf', '--outdir', dir, input],
        { stdio: 'ignore' }
      )
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new OfficeConversionError('LibreOffice took too long to create the PDF.'))
      }, TIMEOUT_MS)
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(new OfficeConversionError(error.message))
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new OfficeConversionError(`LibreOffice exited with code ${code}.`))
      })
    })
    return await readFile(output)
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(profile, { recursive: true, force: true })
  }
}

let localQueue: Promise<void> = Promise.resolve()

/** The agreement as a PDF. Throws OfficeConversionError; never returns the Word file instead. */
export function convertDocxToPdf(docx: Buffer): Promise<Buffer> {
  const converter = pdfConverter()
  if (converter === 'gotenberg') return viaGotenberg(docx)
  if (converter === 'cloudconvert') return viaCloudConvert(docx)
  // One local conversion at a time: LibreOffice misbehaves when two headless jobs share a profile.
  const run = localQueue.then(() => viaLocalLibreOffice(docx))
  localQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}
