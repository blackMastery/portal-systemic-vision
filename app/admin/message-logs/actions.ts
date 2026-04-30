'use server'

import { createServerActionClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type { Database, UserRole } from '@/types/database'
import type { FirebaseProjectType } from '@/lib/firebase/admin'
import { logger } from '@/lib/logger'
import { sendNotificationsToUsers } from '@/lib/firebase/notifications'

function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireAdmin(): Promise<
  | { ok: true; db: ReturnType<typeof createServiceClient>; adminUserId: string }
  | { ok: false; error: string }
> {
  const authClient = createServerActionClient({ cookies })
  const {
    data: { user: authUser },
    error: authError,
  } = await authClient.auth.getUser()

  if (authError || !authUser) {
    return { ok: false, error: 'Not authenticated' }
  }

  const db = createServiceClient()
  const { data: userRow, error: userError } = await db
    .from('users')
    .select('id, role')
    .eq('auth_id', authUser.id)
    .single()

  if (userError || !userRow || userRow.role !== 'admin') {
    return { ok: false, error: 'Only administrators can resend messages.' }
  }

  return { ok: true, db, adminUserId: userRow.id }
}

async function sendTwilioSms(
  to: string,
  body: string
): Promise<{ ok: true; sid: string } | { ok: false; message: string }> {
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

  const twilioResponse = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: twilioBody.toString(),
  })

  const twilioData = (await twilioResponse.json()) as {
    sid?: string
    message?: string
    code?: number
  }

  if (!twilioResponse.ok) {
    logger.error('Twilio API error on resend', { status: twilioResponse.status, data: twilioData })
    return { ok: false, message: twilioData.message || 'Failed to send SMS.' }
  }

  return { ok: true, sid: twilioData.sid! }
}

export type ResendMessageLogResult =
  | { ok: true }
  | { ok: false; error: string }

export async function resendMessageLog(messageLogId: string): Promise<ResendMessageLogResult> {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return { ok: false, error: gate.error }
  }

  const { db, adminUserId } = gate

  const { data: logRow, error: logError } = await db
    .from('message_logs')
    .select('*')
    .eq('id', messageLogId)
    .single()

  if (logError || !logRow) {
    return { ok: false, error: 'Message log not found.' }
  }

  const log = logRow as Database['public']['Tables']['message_logs']['Row']

  if (log.channel === 'sms') {
    let phone = log.recipient_phone?.trim() ?? ''
    if (!phone && log.recipient_user_id) {
      const { data: u } = await db
        .from('users')
        .select('phone_number')
        .eq('id', log.recipient_user_id)
        .maybeSingle()
      phone = (u as { phone_number: string | null } | null)?.phone_number?.trim() ?? ''
    }
    if (!phone) {
      return { ok: false, error: 'No phone number available for this SMS log.' }
    }

    const smsResult = await sendTwilioSms(phone, log.message)
    await db.from('message_logs').insert({
      channel: 'sms',
      recipient_phone: phone,
      recipient_user_id: log.recipient_user_id,
      message: log.message.trim(),
      status: smsResult.ok ? 'sent' : 'failed',
      sent_by_user_id: adminUserId,
      external_id: smsResult.ok ? smsResult.sid : null,
    })

    if (!smsResult.ok) {
      return { ok: false, error: smsResult.message }
    }
    logger.info('Admin resent SMS from message log', { messageLogId, adminUserId })
    return { ok: true }
  }

  const title = log.title?.trim() || 'Notification'
  const body = log.message.trim()
  if (!body) {
    return { ok: false, error: 'Message body is empty.' }
  }

  if (log.recipient_user_id) {
    const { data: targetRaw, error: targetErr } = await db
      .from('users')
      .select('id, role')
      .eq('id', log.recipient_user_id)
      .single()

    const target = targetRaw as { id: string; role: UserRole } | null
    if (targetErr || !target) {
      return { ok: false, error: 'Recipient user no longer exists.' }
    }

    if (target.role === 'driver') {
      const resultDriver = await sendNotificationsToUsers([target.id], title, body, 'driver')
      const resultRider = await sendNotificationsToUsers([target.id], title, body, 'rider')
      const ok = resultDriver.successCount > 0 || resultRider.successCount > 0

      await db.from('message_logs').insert({
        channel: 'push',
        recipient_user_id: target.id,
        title,
        message: body,
        status: ok ? 'sent' : 'failed',
        sent_by_user_id: adminUserId,
        notification_type: log.notification_type ?? 'push',
        metadata: {
          success_count: resultDriver.successCount + resultRider.successCount,
          failure_count: resultDriver.failureCount + resultRider.failureCount,
          invalid_tokens_removed:
            resultDriver.invalidTokens.length + resultRider.invalidTokens.length,
          resent_from_log_id: messageLogId,
        },
      })

      if (!ok) {
        return {
          ok: false,
          error:
            'Push could not be delivered (no reachable devices). A failure entry was logged.',
        }
      }
      logger.info('Admin resent push (driver recipient) from message log', {
        messageLogId,
        adminUserId,
      })
      return { ok: true }
    }

    const result = await sendNotificationsToUsers([target.id], title, body, 'rider')
    const ok = result.successCount > 0

    await db.from('message_logs').insert({
      channel: 'push',
      recipient_user_id: target.id,
      title,
      message: body,
      status: ok ? 'sent' : 'failed',
      sent_by_user_id: adminUserId,
      notification_type: log.notification_type ?? 'push',
      metadata: {
        success_count: result.successCount,
        failure_count: result.failureCount,
        invalid_tokens_removed: result.invalidTokens.length,
        resent_from_log_id: messageLogId,
      },
    })

    if (!ok) {
      return {
        ok: false,
        error:
          'Push could not be delivered (no reachable devices). A failure entry was logged.',
      }
    }
    logger.info('Admin resent push from message log', { messageLogId, adminUserId })
    return { ok: true }
  }

  const audience = log.audience
  if (audience !== 'driver' && audience !== 'rider') {
    return {
      ok: false,
      error:
        'This push log has no recipient user and no valid audience to resend a broadcast.',
    }
  }

  const projectType = audience as FirebaseProjectType

  const { data: recipients, error: recipientsError } = await db
    .from('users')
    .select('id')
    .eq('role', audience)
    .not('fcm_token', 'is', null)

  if (recipientsError) {
    logger.error('resend broadcast: failed to list recipients', recipientsError)
    return { ok: false, error: 'Failed to look up broadcast recipients.' }
  }

  const userIds = ((recipients ?? []) as { id: string }[]).map((r) => r.id)

  if (userIds.length === 0) {
    await db.from('message_logs').insert({
      channel: 'push',
      title,
      message: body,
      status: 'failed',
      sent_by_user_id: adminUserId,
      notification_type: log.notification_type ?? 'broadcast',
      audience,
      metadata: {
        requested_count: 0,
        success_count: 0,
        failure_count: 0,
        resent_from_log_id: messageLogId,
      },
    })
    return {
      ok: false,
      error: 'No recipients with push tokens for this audience.',
    }
  }

  const notificationResult = await sendNotificationsToUsers(
    userIds,
    title,
    body,
    projectType
  )

  await db.from('message_logs').insert({
    channel: 'push',
    title,
    message: body,
    status: notificationResult.successCount > 0 ? 'sent' : 'failed',
    sent_by_user_id: adminUserId,
    notification_type: log.notification_type ?? 'broadcast',
    audience,
    metadata: {
      requested_count: userIds.length,
      success_count: notificationResult.successCount,
      failure_count: notificationResult.failureCount,
      invalid_tokens_removed: notificationResult.invalidTokens.length,
      resent_from_log_id: messageLogId,
    },
  })

  if (notificationResult.successCount === 0) {
    return {
      ok: false,
      error: 'Broadcast push failed for all recipients. A failure entry was logged.',
    }
  }

  logger.info('Admin resent broadcast push from message log', {
    messageLogId,
    audience,
    adminUserId,
  })
  return { ok: true }
}
