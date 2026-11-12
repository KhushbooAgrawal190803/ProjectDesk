import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfficeConversionError, convertDocxToPdf, pdfConverter } from './docx-to-pdf'

const PDF = Buffer.from('%PDF-1.7 converted')
const DOCX = Buffer.from('PK fake docx')

function env(values: Record<string, string | undefined>) {
  for (const key of ['PDF_CONVERTER', 'GOTENBERG_URL', 'GOTENBERG_USERNAME', 'GOTENBERG_PASSWORD', 'CLOUDCONVERT_API_KEY', 'VERCEL']) delete process.env[key]
  Object.assign(process.env, values)
}

afterEach(() => {
  vi.unstubAllGlobals()
  env({})
})

describe('PDF converter choice', () => {
  it('uses Gotenberg, then CloudConvert, then local LibreOffice', () => {
    env({ GOTENBERG_URL: 'https://pdf.example' })
    expect(pdfConverter()).toBe('gotenberg')
    env({ CLOUDCONVERT_API_KEY: 'key' })
    expect(pdfConverter()).toBe('cloudconvert')
    env({})
    expect(pdfConverter()).toBe('libreoffice')
    env({ PDF_CONVERTER: 'cloudconvert', GOTENBERG_URL: 'https://pdf.example' })
    expect(pdfConverter()).toBe('cloudconvert')
  })
})

describe('Gotenberg', () => {
  it('posts the Word file to the LibreOffice route with basic auth and returns the PDF', async () => {
    env({ GOTENBERG_URL: 'https://pdf.example/', GOTENBERG_USERNAME: 'u', GOTENBERG_PASSWORD: 'p' })
    const fetchMock = vi.fn(async () => new Response(new Uint8Array(PDF), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const pdf = await convertDocxToPdf(DOCX)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://pdf.example/forms/libreoffice/convert')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`)
    expect((init.body as FormData).get('files')).toBeTruthy()
  })

  it('retries once after a server error', async () => {
    env({ GOTENBERG_URL: 'https://pdf.example' })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response(new Uint8Array(PDF), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(convertDocxToPdf(DOCX)).resolves.toBeInstanceOf(Buffer)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fails with a clear error instead of returning the Word file', async () => {
    env({ GOTENBERG_URL: 'https://pdf.example' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad request', { status: 400 })))
    await expect(convertDocxToPdf(DOCX)).rejects.toBeInstanceOf(OfficeConversionError)
  })

  it('rejects a response that is not a PDF', async () => {
    env({ GOTENBERG_URL: 'https://pdf.example' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })))
    await expect(convertDocxToPdf(DOCX)).rejects.toThrow('did not return a PDF')
  })

  it('refuses a plain-http service in production', async () => {
    env({ GOTENBERG_URL: 'http://pdf.example', VERCEL: '1' })
    await expect(convertDocxToPdf(DOCX)).rejects.toThrow('https')
  })
})

describe('CloudConvert', () => {
  it('runs an import, LibreOffice convert and export job, then downloads the PDF', async () => {
    env({ CLOUDCONVERT_API_KEY: 'key' })
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://api.cloudconvert.com/v2/jobs') {
        const body = JSON.parse(String(init?.body))
        expect(body.tasks.convert.engine).toBe('libreoffice')
        expect(body.tasks.convert.output_format).toBe('pdf')
        return Response.json({ data: { id: 'job1' } })
      }
      if (url === 'https://sync.api.cloudconvert.com/v2/jobs/job1') {
        return Response.json({ data: { status: 'finished', tasks: [{ name: 'download', status: 'finished', result: { files: [{ url: 'https://files.example/a.pdf' }] } }] } })
      }
      return new Response(new Uint8Array(PDF), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const pdf = await convertDocxToPdf(DOCX)
    expect(pdf.toString()).toContain('%PDF-')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
