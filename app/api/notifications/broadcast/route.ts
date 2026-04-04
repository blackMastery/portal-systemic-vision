import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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

export async function POST(request: NextRequest) {
  try {
    const accessToken = extractBearerToken(request)

    if (!accessToken) {
      const { response, statusCode } = handleApiError(
        new AuthenticationError(
          'Missing or invalid Authorization header. Expected: Bearer <token>'
        )
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const supabase = createSupabaseClientWithToken(accessToken)

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !authUser) {
      logger.warn('Invalid or expired token', { error: authError })
      const { response, statusCode } = handleApiError(
        new AuthenticationError('Invalid or expired token.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', authUser.id)
      .single()

    if (userError || !user) {
      logger.warn('User not found', { authId: authUser.id, error: userError })
      const { response, statusCode } = handleApiError(
        new AuthenticationError('User not found.')
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
        callerUserId: user.id,
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
      callerUserId: user.id,
      recipientCount: userIds.length,
      notificationType: validatedBody.notification_type,
      successCount: notificationResult.successCount,
      failureCount: notificationResult.failureCount,
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
