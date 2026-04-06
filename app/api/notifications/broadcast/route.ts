import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { handleApiError, AuthenticationError } from '@/lib/errors'
import { validate, broadcastNotificationSchema } from '@/lib/validation'
import { logger } from '@/lib/logger'
import {
  createSupabaseServiceClient,
  sendNotificationsToUsers,
} from '@/lib/firebase/notifications'

function createSupabaseClientWithToken(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return null
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null
  }

  return parts[1]
}

/**
 * Prefer validating the Bearer token; if it is stale or invalid (e.g. bad_jwt),
 * fall back to the Supabase session from cookies (same-origin browser requests).
 * Returns a JWT suitable for PostgREST RLS on a dedicated client.
 */
async function resolveCallerAuth(request: NextRequest): Promise<{
  authUser: User
  jwtForRls: string
} | null> {
  const routeClient = createRouteHandlerClient<Database>({ cookies })
  const bearer = extractBearerToken(request)

  if (bearer) {
    const { data: { user }, error } = await routeClient.auth.getUser(bearer)
    if (!error && user) {
      return { authUser: user, jwtForRls: bearer }
    }
    logger.warn('Bearer token rejected; trying cookie session', {
      code: error?.code,
    })
  }

  const { data: { user }, error } = await routeClient.auth.getUser()
  if (error || !user) {
    logger.warn('Invalid or missing auth', {
      code: error?.code,
      hadBearer: Boolean(bearer),
    })
    return null
  }

  const { data: { session } } = await routeClient.auth.getSession()
  const jwtForRls = session?.access_token
  if (!jwtForRls) {
    logger.warn('No access_token in cookie session after getUser')
    return null
  }

  return { authUser: user, jwtForRls }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveCallerAuth(request)
    if (!resolved) {
      const { response, statusCode } = handleApiError(
        new AuthenticationError(
          'Invalid or expired session. Sign in again, or send Authorization: Bearer <access_token> from a fresh session.'
        )
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const { authUser, jwtForRls } = resolved
    const supabase = createSupabaseClientWithToken(jwtForRls)

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', authUser.id)
      .maybeSingle()

    const callerUserId = user ? (user as { id: string }).id : null

    let body: unknown
    try {
      body = await request.json()
    } catch (error) {
      logger.error('Failed to parse request body', error)
      const { response, statusCode } = handleApiError(
        new Error('Invalid JSON in request body.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const validatedBody = validate(broadcastNotificationSchema, body)

    const serviceSupabase = createSupabaseServiceClient()
    const { data: recipients, error: recipientsError } = await serviceSupabase
      .from('users')
      .select('id')
      .eq('role', validatedBody.audience)
      .not('fcm_token', 'is', null)

    if (recipientsError) {
      logger.error('Failed to list broadcast recipients', recipientsError, {
        audience: validatedBody.audience,
      })
      const { response, statusCode } = handleApiError(recipientsError)
      return NextResponse.json(response, { status: statusCode })
    }

    const userIds = ((recipients ?? []) as { id: string }[]).map((r) => r.id)

    if (userIds.length === 0) {
      logger.info('Broadcast skipped: no recipients with FCM tokens', {
        audience: validatedBody.audience,
        callerUserId,
        authId: authUser.id,
      })
      return NextResponse.json(
        {
          success: true,
          message: 'No recipients with FCM tokens for this audience.',
          requestedCount: 0,
          successCount: 0,
          failureCount: 0,
          invalidTokensRemoved: 0,
        },
        { status: 200 }
      )
    }

    const notificationResult = await sendNotificationsToUsers(
      userIds,
      validatedBody.title,
      validatedBody.body,
      validatedBody.audience,
      validatedBody.data
    )

    logger.info('Broadcast notifications sent', {
      audience: validatedBody.audience,
      callerUserId,
      authId: authUser.id,
      recipientCount: userIds.length,
      notificationType: validatedBody.notification_type,
      successCount: notificationResult.successCount,
      failureCount: notificationResult.failureCount,
    })

    await serviceSupabase.from('message_logs').insert({
      channel: 'push',
      title: validatedBody.title,
      message: validatedBody.body,
      status: notificationResult.successCount > 0 ? 'sent' : 'failed',
      sent_by_user_id: callerUserId,
      notification_type: validatedBody.notification_type ?? 'broadcast',
      audience: validatedBody.audience,
      metadata: {
        requested_count: userIds.length,
        success_count: notificationResult.successCount,
        failure_count: notificationResult.failureCount,
        invalid_tokens_removed: notificationResult.invalidTokens.length,
        ...(callerUserId ? {} : { auth_id: authUser.id }),
      },
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Notifications sent successfully',
        requestedCount: userIds.length,
        successCount: notificationResult.successCount,
        failureCount: notificationResult.failureCount,
        invalidTokensRemoved: notificationResult.invalidTokens.length,
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error('Unexpected error in notification broadcast', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
