import { createHmac, timingSafeEqual } from 'crypto'

export interface EmailConfig {
  apiKeyPresent: boolean
  fromAddress: string | null
  fromValid: boolean
  appUrl: string
  appUrlIsLocal: boolean
  dailyLimit: number
  monthlyLimit: number
  paused: boolean
  webhookSecretPresent: boolean
  cronSecretPresent: boolean
  sender: 'resend' | 'mock'
}

function positive(value: string | undefined, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback
}

/** Read from the environment on every call, so a changed .env.local is picked up on restart without code changes. */
export function emailConfig(): EmailConfig {
  const from = (process.env.EMAIL_FROM_ADDRESS || '').trim() || null
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  return {
    apiKeyPresent: Boolean(process.env.RESEND_API_KEY),
    fromAddress: from,
    fromValid: Boolean(from && /^(?:[^<>]+<)?[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>?$/.test(from)),
    appUrl,
    appUrlIsLocal: /localhost|127\.0\.0\.1/.test(appUrl),
    // Resend free plan: 100 emails a day, 3,000 a month. Each recipient counts as one email.
    dailyLimit: positive(process.env.EMAIL_DAILY_LIMIT, 100),
    monthlyLimit: positive(process.env.EMAIL_MONTHLY_LIMIT, 3000),
    paused: process.env.EMAIL_DELIVERY_PAUSED === 'true',
    webhookSecretPresent: Boolean(process.env.RESEND_WEBHOOK_SECRET),
    cronSecretPresent: Boolean(process.env.CRON_SECRET),
    sender: process.env.EMAIL_SENDER === 'mock' || process.env.NODE_ENV === 'test' ? 'mock' : 'resend',
  }
}

export function configProblems(config = emailConfig()): string[] {
  const problems: string[] = []
  if (config.sender === 'resend' && !config.apiKeyPresent) problems.push('RESEND_API_KEY is not set in .env.local.')
  if (!config.fromAddress) problems.push('EMAIL_FROM_ADDRESS is not set in .env.local.')
  else if (!config.fromValid) problems.push('EMAIL_FROM_ADDRESS is not a valid sender, for example "Level Up Buildcon <documents@levelupbuildcon.com>".')
  return problems
}

function linkSecret(): string {
  const own = process.env.EMAIL_LINK_SECRET
  if (own) return own
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('EMAIL_LINK_SECRET is not set')
  // Derived, so the service key itself is never used directly as a link signature.
  return createHmac('sha256', base).update('projectdesk-email-package-links').digest('hex')
}

export function signPackageLink(eventId: string, expiresAt: Date): string {
  const expires = Math.floor(expiresAt.getTime() / 1000)
  const signature = createHmac('sha256', linkSecret()).update(`${eventId}.${expires}`).digest('hex')
  return `${emailConfig().appUrl}/api/email-packages/${eventId}?expires=${expires}&sig=${signature}`
}

export function verifyPackageLink(eventId: string, expires: string | null, signature: string | null, now = new Date()): boolean {
  if (!expires || !signature || !/^\d+$/.test(expires) || !/^[0-9a-f]{64}$/.test(signature)) return false
  if (Number(expires) * 1000 < now.getTime()) return false
  const expected = createHmac('sha256', linkSecret()).update(`${eventId}.${expires}`).digest('hex')
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
}
