import { spawn } from 'child_process'
import { mkdtemp, readFile, rm, writeFile, access } from 'fs/promises'
import os from 'os'
import path from 'path'

const CANDIDATES = [
  process.env.SOFFICE_PATH,
  `${process.env.HOME || ''}/Applications/LibreOffice.app/Contents/MacOS/soffice`,
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/usr/lib/libreoffice/program/soffice',
].filter((value): value is string => Boolean(value))

export class OfficeConversionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OfficeConversionError'
  }
}

let queue: Promise<void> = Promise.resolve()

async function existingBinary(): Promise<string | null> {
  for (const candidate of CANDIDATES) {
    try {
      await access(candidate)
      return candidate
    } catch {
      continue
    }
  }
  return null
}

async function convertOne(docx: Buffer): Promise<Buffer> {
  const binary = await existingBinary()
  if (!binary) {
    throw new OfficeConversionError(
      'LibreOffice is not installed, so the PDF could not be created. The Word file can still be downloaded. On this Mac, install LibreOffice and leave it in /Applications, or set SOFFICE_PATH. On a server, install the libreoffice-writer package and set SOFFICE_PATH to soffice.'
    )
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lubc-office-'))
  const profile = await mkdtemp(path.join(os.tmpdir(), 'lubc-soffice-'))
  const input = path.join(dir, 'document.docx')
  const output = path.join(dir, 'document.pdf')
  try {
    await writeFile(input, docx)
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        binary,
        [
          '--headless',
          '--norestore',
          '--nolockcheck',
          `-env:UserInstallation=file://${profile}`,
          '--convert-to',
          'pdf',
          '--outdir',
          dir,
          input,
        ],
        { stdio: 'ignore' }
      )
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new OfficeConversionError('LibreOffice took too long to create the PDF.'))
      }, 90_000)
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

/** One conversion at a time. LibreOffice misbehaves when two headless jobs share a profile. */
export function convertDocxToPdf(docx: Buffer): Promise<Buffer> {
  const run = queue.then(() => convertOne(docx))
  queue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}
