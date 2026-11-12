import type { DeliveryMode, EventType } from './core'

export interface TemplateData {
  /** Short heading under the brand, e.g. "New booking documents". */
  heading: string
  intro: string
  /** Label / value summary rows. */
  rows: Array<[string, string]>
  documents: Array<{ name: string; type: string }>
  omitted?: Array<{ name: string; reason: string }>
  footnote?: string
}

export interface RenderInput {
  type: EventType
  subject: string
  data: TemplateData
  mode: DeliveryMode
  link?: { url: string; expiresAt: Date } | null
}

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function deliveryNote(mode: DeliveryMode, count: number, link?: RenderInput['link']): string {
  if (mode === 'none') return ''
  if (mode === 'attachments') return `The ${count} document${count === 1 ? ' is' : 's are'} attached to this email as PDF${count === 1 ? '' : 's'}.`
  if (mode === 'zip') return `The ${count} documents are attached as one ZIP file, organised into folders.`
  const expires = link ? link.expiresAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : ''
  return `The ${count} documents are too large to attach, so they are provided through a secure download link${expires ? ` that expires on ${expires}` : ''}. Do not forward this email; anyone with the link can download the files until then.`
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/** One restrained layout for every email: brand, heading, summary, documents, delivery note. */
export function renderEmail(input: RenderInput): { html: string; text: string } {
  const { data } = input
  const count = data.documents.length
  const note = deliveryNote(input.mode, count, input.link)
  const rows = data.rows
    .map(([label, value]) => `<tr><td style="padding:6px 16px 6px 0;color:#71717a;font-size:14px;vertical-align:top;white-space:nowrap">${escape(label)}</td><td style="padding:6px 0;color:#18181b;font-size:14px">${escape(value)}</td></tr>`)
    .join('')
  const docs = data.documents.length
    ? `<h3 style="margin:28px 0 8px;font-size:14px;color:#18181b">Documents (${count})</h3><ul style="margin:0;padding-left:18px;color:#3f3f46;font-size:13px;line-height:1.7">${data.documents
        .slice(0, 60)
        .map((doc) => `<li>${escape(doc.name)}</li>`)
        .join('')}${data.documents.length > 60 ? `<li>…and ${data.documents.length - 60} more in the package</li>` : ''}</ul>`
    : ''
  const omitted = data.omitted?.length
    ? `<div style="margin-top:20px;padding:12px 14px;border:1px solid #fde68a;background:#fffbeb;border-radius:6px;color:#78350f;font-size:13px"><strong>Not included</strong><ul style="margin:6px 0 0;padding-left:18px">${data.omitted
        .map((item) => `<li>${escape(item.name)}: ${escape(item.reason)}</li>`)
        .join('')}</ul></div>`
    : ''
  const button = input.mode === 'link' && input.link
    ? `<p style="margin:24px 0"><a href="${escape(input.link.url)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:600">Download documents (ZIP)</a></p>`
    : ''

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff">
<div style="max-width:640px;margin:0 auto;padding:32px 24px;font-family:${FONT};color:#18181b">
  <p style="margin:0;font-size:13px;letter-spacing:0.12em;font-weight:700">LEVEL UP BUILDCON</p>
  <p style="margin:2px 0 0;font-size:12px;color:#71717a">Project: ANANDAM</p>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:20px 0" />
  <h2 style="margin:0 0 8px;font-size:18px">${escape(data.heading)}</h2>
  <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6">${escape(data.intro)}</p>
  ${rows ? `<table role="presentation" style="border-collapse:collapse">${rows}</table>` : ''}
  ${docs}
  ${omitted}
  ${note ? `<p style="margin:20px 0 0;font-size:13px;color:#3f3f46;line-height:1.6">${escape(note)}</p>` : ''}
  ${button}
  ${data.footnote ? `<p style="margin:16px 0 0;font-size:12px;color:#71717a">${escape(data.footnote)}</p>` : ''}
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:28px 0 12px" />
  <p style="margin:0;font-size:11px;color:#a1a1aa;line-height:1.6">Sent automatically by ProjectDesk to Level Up Buildcon company addresses only. Contains confidential booking and financial documents.</p>
</div></body></html>`

  const text = [
    'LEVEL UP BUILDCON',
    'Project: ANANDAM',
    '',
    data.heading,
    data.intro,
    '',
    ...data.rows.map(([label, value]) => `${label}: ${value}`),
    ...(data.documents.length ? ['', `Documents (${count}):`, ...data.documents.map((doc) => `- ${doc.name}`)] : []),
    ...(data.omitted?.length ? ['', 'Not included:', ...data.omitted.map((item) => `- ${item.name}: ${item.reason}`)] : []),
    ...(note ? ['', note] : []),
    ...(input.mode === 'link' && input.link ? ['', `Download: ${input.link.url}`] : []),
    ...(data.footnote ? ['', data.footnote] : []),
    '',
    'Sent automatically by ProjectDesk to Level Up Buildcon company addresses only.',
  ].join('\n')

  return { html, text }
}
