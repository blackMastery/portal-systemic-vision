import { logger } from '@/lib/logger'

export type TwilioSendResult =
  | { ok: true; sid: string }
  | { ok: false; code?: number; message: string }

export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  )
}

/**
 * Normalizes a free-text phone number to E.164 for Guyana (+592).
 * - keeps an explicit leading `+`
 * - `592XXXXXXX` (10 digits) -> `+592XXXXXXX`
 * - 7 local digits -> `+592` + digits
 * Returns null when the input cannot be made dialable.
 */
export function normalizeToE164Guyana(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  if (hasPlus) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  }
  if (digits.length === 7) return `+592${digits}`
  if (digits.length === 10 && digits.startsWith('592')) return `+${digits}`
  if (digits.length === 11 && digits.startsWith('0592')) return `+${digits.slice(1)}`
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`
  return null
}

/**
 * Sends one SMS via the Twilio REST API. Never throws; network and timeout
 * failures are returned as `{ ok: false }`.
 */
export async function sendTwilioSms(
  to: string,
  body: string,
  opts: { timeoutMs?: number } = {}
): Promise<TwilioSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_FROM_NUMBER
  if (!accountSid || !authToken || !fromNumber) {
    return { ok: false, message: 'SMS service is not configured.' }
  }

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const twilioBody = new URLSearchParams({
    To: to.trim(),
    From: fromNumber,
    Body: body.trim(),
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000)
  try {
    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: twilioBody.toString(),
      signal: controller.signal,
    })
    const twilioData = (await twilioResponse.json().catch(() => ({}))) as {
      sid?: string
      message?: string
      code?: number
    }
    if (!twilioResponse.ok || !twilioData.sid) {
      logger.error('Twilio API error', { status: twilioResponse.status, data: twilioData })
      return {
        ok: false,
        code: twilioData.code,
        message: twilioData.message || 'Failed to send SMS.',
      }
    }
    return { ok: true, sid: twilioData.sid }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    logger.error('Twilio request failed', { error, aborted })
    return { ok: false, message: aborted ? 'SMS request timed out.' : 'SMS request failed.' }
  } finally {
    clearTimeout(timer)
  }
}
