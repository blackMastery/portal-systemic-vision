/**
 * Firebase Cloud Messaging notification utilities
 * Handles fetching FCM tokens and sending push notifications
 */

import { getMessagingInstance, type FirebaseProjectType } from './admin'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { logger } from '@/lib/logger'
import type { Message } from 'firebase-admin/messaging'

// FCM supports up to 500 tokens per batch
const FCM_BATCH_SIZE = 500

/**
 * Create a Supabase client with service role key for server-side operations
 */
function createSupabaseServiceClient() {
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

  const { data: users, error } = await supabase
    .from('users')
    .select('id, fcm_token')
    .in('id', userIds)
    .not('fcm_token', 'is', null)

  if (error) {
    logger.error('Failed to fetch FCM tokens', error, { userIds })
    throw error
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

  const message: Message = {
    notification: {
      title,
      body,
    },
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

  logger.info('Notification sending completed', {
    successCount: aggregatedResult.successCount,
    failureCount: aggregatedResult.failureCount,
    invalidTokensRemoved: aggregatedResult.invalidTokens.length,
  })

  return aggregatedResult
}
