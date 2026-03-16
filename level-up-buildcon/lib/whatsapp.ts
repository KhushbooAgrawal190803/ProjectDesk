// WhatsApp sending via Twilio API (no package needed — uses fetch)
//
// Configure these in your .env.local:
// TWILIO_ACCOUNT_SID=your-account-sid
// TWILIO_AUTH_TOKEN=your-auth-token
// TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   (your Twilio sandbox or business number)

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM

function isWhatsAppConfigured(): boolean {
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM)
}

interface SendWhatsAppOptions {
  to: string          // Phone number with country code, e.g., "+919876543210"
  message: string     // Message body
  mediaUrl?: string   // Optional URL to a document/image to attach
}

export async function sendWhatsApp(options: SendWhatsAppOptions): Promise<boolean> {
  if (!isWhatsAppConfigured()) {
    console.warn('[WhatsApp] Twilio not configured — skipping WhatsApp send')
    return false
  }

  try {
    // Normalize phone number — ensure it starts with + and has country code
    let toNumber = options.to.replace(/\s+/g, '')
    if (!toNumber.startsWith('+')) {
      // Assume Indian number if no country code
      toNumber = toNumber.startsWith('91') ? `+${toNumber}` : `+91${toNumber}`
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
    
    const body = new URLSearchParams({
      From: TWILIO_WHATSAPP_FROM!,
      To: `whatsapp:${toNumber}`,
      Body: options.message,
    })

    // Attach media (document link) if provided
    if (options.mediaUrl) {
      body.append('MediaUrl', options.mediaUrl)
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('[WhatsApp] Twilio error:', errorData)
      return false
    }

    const result = await response.json()
    console.log(`[WhatsApp] Sent to ${toNumber}, SID: ${result.sid}`)
    return true
  } catch (error) {
    console.error('[WhatsApp] Failed to send:', error)
    return false
  }
}

export function buildDispatchWhatsAppMessage(params: {
  applicantName: string
  serialDisplay: string
  copyType: string
  documentUrl: string
}): string {
  return [
    `📄 *Level Up Buildcon*`,
    ``,
    `Dear *${params.applicantName}*,`,
    ``,
    `Your booking document (*${params.copyType} copy*) for *${params.serialDisplay}* has been processed and is ready.`,
    ``,
    `📥 Download: ${params.documentUrl}`,
    ``,
    `_This link is valid for 7 days._`,
    ``,
    `Thank you!`,
    `Level Up Buildcon`,
  ].join('\n')
}

export { isWhatsAppConfigured }
