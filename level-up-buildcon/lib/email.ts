import nodemailer from 'nodemailer'

// Configure these in your .env.local:
// SMTP_HOST=smtp.gmail.com
// SMTP_PORT=587
// SMTP_USER=your-email@gmail.com
// SMTP_PASS=your-app-password  (Gmail: Settings > Security > App Passwords)
// SMTP_FROM="Level Up Buildcon <your-email@gmail.com>"

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = Number(process.env.SMTP_PORT || '587')
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER

function isEmailConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS)
}

function createTransporter() {
  if (!isEmailConfigured()) {
    throw new Error('Email not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.local')
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  })
}

interface SendEmailOptions {
  to: string
  subject: string
  html: string
  attachmentUrl?: string
  attachmentName?: string
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.warn('[Email] SMTP not configured — skipping email send')
    return false
  }

  try {
    const transporter = createTransporter()

    // If there's an attachment URL, fetch it and attach as buffer
    let attachments: any[] = []
    if (options.attachmentUrl && options.attachmentName) {
      try {
        const response = await fetch(options.attachmentUrl)
        const buffer = Buffer.from(await response.arrayBuffer())
        attachments = [{
          filename: options.attachmentName,
          content: buffer,
        }]
      } catch (err) {
        console.error('[Email] Failed to fetch attachment:', err)
        // Still send email without attachment
      }
    }

    await transporter.sendMail({
      from: SMTP_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      attachments,
    })

    console.log(`[Email] Sent to ${options.to}`)
    return true
  } catch (error) {
    console.error('[Email] Failed to send:', error)
    return false
  }
}

export function buildDispatchEmailHtml(params: {
  applicantName: string
  serialDisplay: string
  copyType: string
  documentUrl: string
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 20px;">Level Up Buildcon</h1>
      </div>
      <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; color: #374151;">Dear <strong>${params.applicantName}</strong>,</p>
        <p style="font-size: 14px; color: #6b7280;">
          Your booking document (<strong>${params.copyType} copy</strong>) for 
          <strong>${params.serialDisplay}</strong> has been processed and is ready.
        </p>
        <p style="font-size: 14px; color: #6b7280;">
          The document is also attached to this email for your reference.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${params.documentUrl}" 
             style="background: #1e40af; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            View Document
          </a>
        </div>
        <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
          This link is valid for 7 days. If you have any questions, please contact us.
        </p>
      </div>
      <p style="font-size: 11px; color: #9ca3af; text-align: center; margin-top: 16px;">
        Level Up Buildcon — Building Dreams, Delivering Trust
      </p>
    </div>
  `
}

export { isEmailConfigured }
