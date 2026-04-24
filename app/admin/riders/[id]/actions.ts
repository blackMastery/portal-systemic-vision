'use server'

import { createServerActionClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { sendNotificationsToUsers } from '@/lib/firebase/notifications'
import { logger } from '@/lib/logger'
import type { Database, UserRole } from '@/types/database'

function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface SendRiderPushResult {
  success: boolean
  successCount: number
  failureCount: number
  error?: string
}

export interface SendRiderPushOptions {
  skipInAppNotificationInsert?: boolean
  dataJson?: string
}

function parseFcmDataFromJson(
  dataJson: string | undefined
): { ok: true; data: Record<string, string> | undefined } | { ok: false; error: string } {
  if (dataJson == null || dataJson.trim() === '') {
    return { ok: true, data: undefined }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(dataJson)
  } catch {
    return { ok: false, error: 'Data must be valid JSON' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Data must be a JSON object (not an array or primitive)' }
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (k.length > 256) {
      return { ok: false, error: 'Data contains a key that is too long' }
    }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = String(v)
    } else if (v === null) {
      out[k] = ''
    } else {
      out[k] = JSON.stringify(v)
    }
  }
  const serialized = JSON.stringify(out)
  if (serialized.length > 3500) {
    return { ok: false, error: 'Data payload is too large for FCM (try fewer or smaller keys)' }
  }
  return { ok: true, data: Object.keys(out).length > 0 ? out : undefined }
}

export async function sendRiderPushNotification(
  riderUserId: string,
  title: string,
  body: string,
  options?: SendRiderPushOptions
): Promise<SendRiderPushResult> {
  const authClient = createServerActionClient({ cookies })
  const {
    data: { user: authUser },
    error: authError,
  } = await authClient.auth.getUser()

  if (authError || !authUser) {
    return { success: false, successCount: 0, failureCount: 0, error: 'Not authenticated' }
  }

  const db = createServiceClient()

  const { data: adminUser } = await db
    .from('users')
    .select('id')
    .eq('auth_id', authUser.id)
    .single()
  const adminUserId = (adminUser as { id: string } | null)?.id ?? null

  const { data: targetUserRaw, error: userError } = await db
    .from('users')
    .select('id, role')
    .eq('id', riderUserId)
    .single()

  const targetUser = targetUserRaw as { id: string; role: UserRole } | null

  if (userError || !targetUser) {
    return { success: false, successCount: 0, failureCount: 0, error: 'User not found' }
  }

  if (targetUser.role !== 'rider') {
    return { success: false, successCount: 0, failureCount: 0, error: 'Target user is not a rider' }
  }

  const parsedData = parseFcmDataFromJson(options?.dataJson)
  if (!parsedData.ok) {
    return { success: false, successCount: 0, failureCount: 0, error: parsedData.error }
  }
  const fcmData = parsedData.data

  const result = await sendNotificationsToUsers(
    [riderUserId],
    title,
    body,
    'rider',
    fcmData
  )

  if (!options?.skipInAppNotificationInsert && result.successCount > 0) {
    type NotificationInsert = Database['public']['Tables']['notifications']['Insert']
    const { error: insertError } = await db
      .from('notifications')
      .insert({
        user_id: riderUserId,
        title,
        body,
        notification_type: 'push',
        is_read: false,
        read_at: null,
      } satisfies NotificationInsert)

    if (insertError) {
      logger.warn('Failed to create notification record', { error: insertError, riderUserId })
    }
  }

  await db.from('message_logs').insert({
    channel: 'push',
    recipient_user_id: riderUserId,
    title,
    message: body,
    status: result.successCount > 0 ? 'sent' : 'failed',
    sent_by_user_id: adminUserId,
    notification_type: 'push',
    metadata: {
      success_count: result.successCount,
      failure_count: result.failureCount,
      invalid_tokens_removed: result.invalidTokens.length,
      ...(fcmData ? { fcm_data_keys: Object.keys(fcmData) } : {}),
    },
  })

  logger.info('Admin sent push notification to rider', {
    riderUserId,
    successCount: result.successCount,
    failureCount: result.failureCount,
  })

  return {
    success: result.successCount > 0,
    successCount: result.successCount,
    failureCount: result.failureCount,
  }
}
