'use server'

import { createServerActionClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { sendNotificationsToUsers } from '@/lib/firebase/notifications'
import { logger } from '@/lib/logger'
import type { Database } from '@/types/database'

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

export async function sendDriverPushNotification(
  driverUserId: string,
  title: string,
  body: string
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

  // Verify the target user_id belongs to a driver
  const { data: targetUser, error: userError } = await db
    .from('users')
    .select('id, role')
    .eq('id', driverUserId)
    .single()

  if (userError || !targetUser) {
    return { success: false, successCount: 0, failureCount: 0, error: 'Driver not found' }
  }

  if (targetUser.role !== 'driver') {
    return { success: false, successCount: 0, failureCount: 0, error: 'Target user is not a driver' }
  }

  // Send via Firebase FCM
  const result = await sendNotificationsToUsers(
    [driverUserId],
    title,
    body,
    'driver'
  )

  // Record the notification in the database if delivery succeeded
  if (result.successCount > 0) {
    const { error: insertError } = await db
      .from('notifications')
      .insert({
        user_id: driverUserId,
        title,
        body,
        notification_type: 'push',
        is_read: false,
      })

    if (insertError) {
      logger.warn('Failed to create notification record', { error: insertError, driverUserId })
    }
  }

  logger.info('Admin sent push notification to driver', {
    driverUserId,
    successCount: result.successCount,
    failureCount: result.failureCount,
  })

  return {
    success: result.successCount > 0,
    successCount: result.successCount,
    failureCount: result.failureCount,
  }
}
