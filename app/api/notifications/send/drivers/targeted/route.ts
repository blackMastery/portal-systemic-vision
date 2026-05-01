import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  handleApiError,
  AuthenticationError,
  AuthorizationError,
} from '@/lib/errors'
import { validate, targetedDriverNotificationSchema } from '@/lib/validation'
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
  if (!authHeader) return null
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  return parts[1]
}

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

    const { data: callerRow, error: callerError } = await supabase
      .from('users')
      .select('id, role')
      .eq('auth_id', authUser.id)
      .maybeSingle()

    if (callerError) {
      logger.error('Failed to load caller user row', callerError, {
        authId: authUser.id,
      })
      const { response, statusCode } = handleApiError(callerError)
      return NextResponse.json(response, { status: statusCode })
    }

    const caller = callerRow as { id: string; role: string } | null
    if (!caller || caller.role !== 'admin') {
      const { response, statusCode } = handleApiError(
        new AuthorizationError('Admin role required.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

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

    const validatedBody = validate(targetedDriverNotificationSchema, body)
    const uniqueUserIds = Array.from(new Set(validatedBody.user_ids))

    const notificationResult = await sendNotificationsToUsers(
      uniqueUserIds,
      validatedBody.title,
      validatedBody.body,
      'driver',
      validatedBody.data
    )

    logger.info('Targeted driver push sent', {
      callerUserId: caller.id,
      authId: authUser.id,
      requestedCount: uniqueUserIds.length,
      notificationType: validatedBody.notification_type,
      successCount: notificationResult.successCount,
      failureCount: notificationResult.failureCount,
    })

    const serviceSupabase = createSupabaseServiceClient()
    await serviceSupabase.from('message_logs').insert({
      channel: 'push',
      title: validatedBody.title,
      message: validatedBody.body,
      status: notificationResult.successCount > 0 ? 'sent' : 'failed',
      sent_by_user_id: caller.id,
      notification_type: validatedBody.notification_type ?? 'admin_targeted',
      audience: 'driver',
      metadata: {
        requested_count: uniqueUserIds.length,
        success_count: notificationResult.successCount,
        failure_count: notificationResult.failureCount,
        invalid_tokens_removed: notificationResult.invalidTokens.length,
      },
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Notifications sent successfully',
        requestedCount: uniqueUserIds.length,
        successCount: notificationResult.successCount,
        failureCount: notificationResult.failureCount,
        invalidTokensRemoved: notificationResult.invalidTokens.length,
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error('Unexpected error in targeted driver push', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
