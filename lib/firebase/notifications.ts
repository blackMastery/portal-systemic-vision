/**
 * Firebase Cloud Messaging notification utilities
 * Handles fetching FCM tokens and sending push notifications
 */

import { getMessagingInstance, type FirebaseProjectType } from './admin'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { logger } from '@/lib/logger'
import type { MulticastMessage } from 'firebase-admin/messaging'

// FCM supports up to 500 tokens per batch
const FCM_BATCH_SIZE = 500
// Keep PostgREST `in` filters bounded to avoid oversized requests.
const SUPABASE_IN_FILTER_BATCH_SIZE = 200

/** Platform overrides so notifications play the default system sound (iOS + Android). */
const NOTIFICATION_PLATFORM_SOUND = {
  android: {
    notification: {
      defaultSound: true as const,
    },
  },
  apns: {
    payload: {
      aps: {
        sound: 'default',
      },
    },
  },
} satisfies Pick<MulticastMessage, 'android' | 'apns'>

/**
 * Create a Supabase client with service role key for server-side operations
 */
export function createSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * FCM token with user information
 */
export interface FCMTokenWithUser {
  user_id: string
  fcm_token: string
}

/**
 * Result of sending notifications
 */
export interface NotificationSendResult {
  successCount: number
  failureCount: number
  invalidTokens: string[] // Tokens that should be removed from database
  errors: Array<{ token: string; error: string }>
}

/**
 * Fetch FCM tokens for given user IDs
 * Returns only users that have FCM tokens
 */
export async function fetchFCMTokensForUsers(
  userIds: string[]
): Promise<FCMTokenWithUser[]> {
  if (userIds.length === 0) {
    return []
  }

  const supabase = createSupabaseServiceClient()
  const users: Array<{ id: string; fcm_token: string | null }> = []

  for (let i = 0; i < userIds.length; i += SUPABASE_IN_FILTER_BATCH_SIZE) {
    const userIdBatch = userIds.slice(i, i + SUPABASE_IN_FILTER_BATCH_SIZE)

    const { data: usersBatch, error } = await supabase
      .from('users')
      .select('id, fcm_token')
      .in('id', userIdBatch)
      .not('fcm_token', 'is', null)

    if (error) {
      logger.error('Failed to fetch FCM tokens', error, {
        userIds,
        batchStart: i,
        batchSize: userIdBatch.length,
      })
      throw error
    }

    if (usersBatch && usersBatch.length > 0) {
      users.push(...(usersBatch as Array<{ id: string; fcm_token: string | null }>))
    }
  }

  if (!users || users.length === 0) {
    logger.warn('No users with FCM tokens found', { userIds })
    return []
  }

  // Filter out any null tokens (shouldn't happen due to query, but TypeScript safety)
  const tokensWithUsers: FCMTokenWithUser[] = users
    .filter((user) => user.fcm_token !== null)
    .map((user) => ({
      user_id: user.id,
      fcm_token: user.fcm_token as string,
    }))

  logger.info('Fetched FCM tokens', {
    requestedCount: userIds.length,
    foundCount: tokensWithUsers.length,
  })

  return tokensWithUsers
}

/**
 * Remove invalid FCM tokens from database
 */
async function removeInvalidTokens(userIds: string[]): Promise<void> {
  if (userIds.length === 0) {
    return
  }

  const supabase = createSupabaseServiceClient()

  const { error } = await supabase
    .from('users')
    .update({ fcm_token: null })
    .in('id', userIds)

  if (error) {
    logger.error('Failed to remove invalid FCM tokens', error, { userIds })
    // Don't throw - this is a cleanup operation
  } else {
    logger.info('Removed invalid FCM tokens', { count: userIds.length })
  }
}

/**
 * Send notification to a batch of FCM tokens
 */
async function sendBatch(
  tokens: string[],
  title: string,
  body: string,
  projectType: FirebaseProjectType,
  data?: Record<string, string>
): Promise<NotificationSendResult> {
  const messaging = await getMessagingInstance(projectType)

  const message: MulticastMessage = {
    notification: {
      title,
      body,
    },
    ...NOTIFICATION_PLATFORM_SOUND,
    data: data
      ? Object.entries(data).reduce(
          (acc, [key, value]) => {
            acc[key] = String(value)
            return acc
          },
          {} as Record<string, string>
        )
      : undefined,
    tokens,
  }

  try {
    const response = await messaging.sendEachForMulticast(message)

    const result: NotificationSendResult = {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens: [],
      errors: [],
    }

    // Process responses to identify invalid tokens
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const token = tokens[idx]
        result.errors.push({
          token,
          error: resp.error?.message || 'Unknown error',
        })

        // Check if token is invalid and should be removed
        if (
          resp.error?.code === 'messaging/invalid-registration-token' ||
          resp.error?.code === 'messaging/registration-token-not-registered'
        ) {
          result.invalidTokens.push(token)
        }
      }
    })

    return result
  } catch (error) {
    logger.error('Failed to send notification batch', error, {
      tokenCount: tokens.length,
    })
    throw error
  }
}

/**
 * Send push to explicit FCM tokens (no DB lookup or invalid-token cleanup).
 */
export async function sendPushToFcmTokens(
  tokens: string[],
  title: string,
  body: string,
  projectType: FirebaseProjectType,
  data?: Record<string, string>
): Promise<NotificationSendResult> {
  if (tokens.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
      errors: [],
    }
  }

  const batches: string[][] = []
  for (let i = 0; i < tokens.length; i += FCM_BATCH_SIZE) {
    batches.push(tokens.slice(i, i + FCM_BATCH_SIZE))
  }

  logger.info('Sending direct FCM notifications in batches', {
    totalTokens: tokens.length,
    batchCount: batches.length,
  })

  const batchResults = await Promise.all(
    batches.map((batch) => sendBatch(batch, title, body, projectType, data))
  )

  const aggregatedResult: NotificationSendResult = {
    successCount: batchResults.reduce((sum, r) => sum + r.successCount, 0),
    failureCount: batchResults.reduce((sum, r) => sum + r.failureCount, 0),
    invalidTokens: batchResults.flatMap((r) => r.invalidTokens),
    errors: batchResults.flatMap((r) => r.errors),
  }

  if (aggregatedResult.errors.length > 0) {
    logger.warn('FCM send errors (direct tokens)', {
      errors: aggregatedResult.errors,
    })
  }

  logger.info('Direct FCM notification sending completed', {
    successCount: aggregatedResult.successCount,
    failureCount: aggregatedResult.failureCount,
    invalidTokenCount: aggregatedResult.invalidTokens.length,
  })

  return aggregatedResult
}

/**
 * Send push notifications to multiple users
 * Handles batching for large token lists
 */
export async function sendNotificationsToUsers(
  userIds: string[],
  title: string,
  body: string,
  projectType: FirebaseProjectType,
  data?: Record<string, string>
): Promise<NotificationSendResult> {
  if (userIds.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
      errors: [],
    }
  }

  // Fetch FCM tokens for users
  const tokensWithUsers = await fetchFCMTokensForUsers(userIds)

  if (tokensWithUsers.length === 0) {
    logger.warn('No FCM tokens found for users', { userIds })
    return {
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
      errors: [],
    }
  }

  const allTokens = tokensWithUsers.map((t) => t.fcm_token)

  // Batch tokens if needed (FCM supports up to 500 per batch)
  const batches: string[][] = []
  for (let i = 0; i < allTokens.length; i += FCM_BATCH_SIZE) {
    batches.push(allTokens.slice(i, i + FCM_BATCH_SIZE))
  }

  logger.info('Sending notifications in batches', {
    totalTokens: allTokens.length,
    batchCount: batches.length,
  })

  // Send all batches
  const batchResults = await Promise.all(
    batches.map((batch) => sendBatch(batch, title, body, projectType, data))
  )

  // Aggregate results
  const aggregatedResult: NotificationSendResult = {
    successCount: batchResults.reduce((sum, r) => sum + r.successCount, 0),
    failureCount: batchResults.reduce((sum, r) => sum + r.failureCount, 0),
    invalidTokens: batchResults.flatMap((r) => r.invalidTokens),
    errors: batchResults.flatMap((r) => r.errors),
  }

  // Remove invalid tokens from database
  if (aggregatedResult.invalidTokens.length > 0) {
    const userIdsToCleanup = tokensWithUsers
      .filter((t) => aggregatedResult.invalidTokens.includes(t.fcm_token))
      .map((t) => t.user_id)

    await removeInvalidTokens(userIdsToCleanup)
  }

  if (aggregatedResult.errors.length > 0) {
    logger.warn('FCM send errors', { errors: aggregatedResult.errors })
  }

  logger.info('Notification sending completed', {
    successCount: aggregatedResult.successCount,
    failureCount: aggregatedResult.failureCount,
    invalidTokensRemoved: aggregatedResult.invalidTokens.length,
  })

  return aggregatedResult
}

const TRIP_REQUESTS_PAUSED_TITLE = 'Sending Trips Requests is temporarily unavailable'
const TRIP_REQUESTS_PAUSED_BODY =
  'Sending trip requests is temporarily unavailable. will resume shortly.'

const TRIP_REQUESTS_FCM_DATA: Record<string, string> = {
  trip_requests_enabled: 'false',
}

/**
 * Broadcast to all riders and drivers with an FCM token that trip request creation is paused.
 * Logs a single message_logs row. Use after system_config is updated to disabled.
 */
export async function sendTripRequestsPausedNotificationToRidersAndDrivers(
  sentByUserId: string
): Promise<void> {
  const supabase = createSupabaseServiceClient()

  const { data: riderRows, error: ridersError } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'rider')
    .not('fcm_token', 'is', null)

  if (ridersError) {
    logger.error('Failed to list rider recipients for trip pause push', ridersError)
    throw ridersError
  }

  const { data: driverRows, error: driversError } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'driver')
    .not('fcm_token', 'is', null)

  if (driversError) {
    logger.error('Failed to list driver recipients for trip pause push', driversError)
    throw driversError
  }

  const riderUserIds = ((riderRows ?? []) as { id: string }[]).map((r) => r.id)
  const driverUserIds = ((driverRows ?? []) as { id: string }[]).map((r) => r.id)

  const requestedRider = riderUserIds.length
  const requestedDriver = driverUserIds.length

  const [riderResult, driverResult] = await Promise.all([
    sendNotificationsToUsers(
      riderUserIds,
      TRIP_REQUESTS_PAUSED_TITLE,
      TRIP_REQUESTS_PAUSED_BODY,
      'rider',
      TRIP_REQUESTS_FCM_DATA
    ),
    sendNotificationsToUsers(
      driverUserIds,
      TRIP_REQUESTS_PAUSED_TITLE,
      TRIP_REQUESTS_PAUSED_BODY,
      'driver',
      TRIP_REQUESTS_FCM_DATA
    ),
  ])

  const successCount = riderResult.successCount + driverResult.successCount
  const failureCount = riderResult.failureCount + driverResult.failureCount
  const invalidRemoved =
    riderResult.invalidTokens.length + driverResult.invalidTokens.length

  const { error: logError } = await supabase.from('message_logs').insert({
    channel: 'push',
    title: TRIP_REQUESTS_PAUSED_TITLE,
    message: TRIP_REQUESTS_PAUSED_BODY,
    status: successCount > 0 ? 'sent' : 'failed',
    sent_by_user_id: sentByUserId,
    notification_type: 'trip_requests_paused',
    audience: 'rider,driver',
    metadata: {
      requested_rider_count: requestedRider,
      requested_driver_count: requestedDriver,
      success_count: successCount,
      failure_count: failureCount,
      invalid_tokens_removed: invalidRemoved,
    },
  })

  if (logError) {
    logger.error('message_logs insert failed after trip pause push', logError)
    throw logError
  }

  logger.info('Trip requests paused push completed', {
    sentByUserId,
    requestedRider,
    requestedDriver,
    successCount,
    failureCount,
  })
}
