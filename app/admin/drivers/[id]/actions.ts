'use server'

import { createServerActionClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { sendNotificationsToUsers } from '@/lib/firebase/notifications'
import { logger } from '@/lib/logger'
import type { Database, UserRole } from '@/types/database'

// Typed service role client — same pattern used in lib/firebase/notifications.ts
function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface SendDriverPushResult {
  success: boolean
  successCount: number
  failureCount: number
  error?: string
}

export interface SendDriverPushOptions {
  /** When true, caller is responsible for the in-app `notifications` row (e.g. verification flow). */
  skipInAppNotificationInsert?: boolean
  /**
   * Optional JSON object string for FCM `data` (key/value for the client app).
   * Must be a JSON object (not an array). Nested values are JSON-stringified per FCM string rules.
   */
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

export async function sendDriverPushNotification(
  driverUserId: string,
  title: string,
  body: string,
  options?: SendDriverPushOptions
): Promise<SendDriverPushResult> {
  // Use auth-helpers client solely for session verification
  const authClient = createServerActionClient({ cookies })
  const {
    data: { user: authUser },
    error: authError,
  } = await authClient.auth.getUser()

  if (authError || !authUser) {
    return { success: false, successCount: 0, failureCount: 0, error: 'Not authenticated' }
  }

  const db = createServiceClient()

  // Resolve admin's user ID for logging
  const { data: adminUser } = await db
    .from('users')
    .select('id')
    .eq('auth_id', authUser.id)
    .single()
  const adminUserId = (adminUser as { id: string } | null)?.id ?? null

  // Verify the target user_id belongs to a driver
  const { data: targetUserRaw, error: userError } = await db
    .from('users')
    .select('id, role')
    .eq('id', driverUserId)
    .single()

  const targetUser = targetUserRaw as { id: string; role: UserRole } | null

  if (userError || !targetUser) {
    return { success: false, successCount: 0, failureCount: 0, error: 'Driver not found' }
  }

  if (targetUser.role !== 'driver') {
    return { success: false, successCount: 0, failureCount: 0, error: 'Target user is not a driver' }
  }

  const parsedData = parseFcmDataFromJson(options?.dataJson)
  if (!parsedData.ok) {
    return { success: false, successCount: 0, failureCount: 0, error: parsedData.error }
  }
  const fcmData = parsedData.data

  // Send via Firebase FCM
  const resultDriver = await sendNotificationsToUsers(
    [driverUserId],
    title,
    body,
    'driver',
    fcmData
  )

  const resultRider = await sendNotificationsToUsers(
    [driverUserId],
    title,
    body,
    'rider',
    fcmData
  )

  const resultRider = await sendNotificationsToUsers(
    [driverUserId],
    title,
    body,
    'rider'
  )

  // Record the notification in the database if delivery succeeded (unless caller already did)
  if (!options?.skipInAppNotificationInsert && (resultDriver.successCount > 0 || resultRider.successCount > 0)) {
    type NotificationInsert = Database['public']['Tables']['notifications']['Insert']
    const { error: insertError } = await db
      .from('notifications')
      .insert({
        user_id: driverUserId,
        title,
        body,
        notification_type: 'push',
        is_read: false,
        read_at: null,
      } satisfies NotificationInsert)

    if (insertError) {
      logger.warn('Failed to create notification record', { error: insertError, driverUserId })
    }
  }

  // Log to message_logs for admin audit trail
  await db.from('message_logs').insert({
    channel: 'push',
    recipient_user_id: driverUserId,
    title,
    message: body,
    status: resultDriver.successCount > 0 || resultRider.successCount > 0 ? 'sent' : 'failed',
    sent_by_user_id: adminUserId,
    notification_type: 'push',
    metadata: {
      success_count: resultDriver.successCount + resultRider.successCount,
      failure_count: resultDriver.failureCount + resultRider.failureCount,
      invalid_tokens_removed: resultDriver.invalidTokens.length + resultRider.invalidTokens.length,
      ...(fcmData ? { fcm_data_keys: Object.keys(fcmData) } : {}),
    },
  })

  logger.info('Admin sent push notification to driver', {
    driverUserId,
    successCount: resultDriver.successCount + resultRider.successCount,
    failureCount: resultDriver.failureCount + resultRider.failureCount,
  })

  return {
    success: resultDriver.successCount > 0 || resultRider.successCount > 0,
    successCount: resultDriver.successCount + resultRider.successCount,
    failureCount: resultDriver.failureCount + resultRider.failureCount,
  }
}
