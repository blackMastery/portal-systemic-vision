import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleApiError, AuthenticationError } from '@/lib/errors'
import { validate, notificationSchema } from '@/lib/validation'
import { logger } from '@/lib/logger'
import { sendPushToFcmTokens } from '@/lib/firebase/notifications'

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

    const validatedBody = validate(notificationSchema, body)

    const notificationResult = await sendPushToFcmTokens(
      [validatedBody.fcm_token],
      validatedBody.title,
      validatedBody.body,
      'driver',
      validatedBody.data
    )

    logger.info('Notification sent to driver FCM token', {
      tokenCount: 1,
      successCount: notificationResult.successCount,
      failureCount: notificationResult.failureCount,
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Notification sent successfully',
        requestedCount: 1,
        successCount: notificationResult.successCount,
        failureCount: notificationResult.failureCount,
        invalidTokensRemoved: notificationResult.invalidTokens.length,
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error('Unexpected error sending notification to driver', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
