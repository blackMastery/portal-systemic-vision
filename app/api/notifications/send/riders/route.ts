import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  handleApiError,
  AuthenticationError,
  ValidationError,
} from '@/lib/errors'
import { validate, notificationSchema } from '@/lib/validation'
import { logger } from '@/lib/logger'
import { sendNotificationsToUsers } from '@/lib/firebase/notifications'

// Create a Supabase client with Bearer token authentication
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

// Extract Bearer token from Authorization header
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
    // 1. Extract and validate Bearer token
    const accessToken = extractBearerToken(request)

    if (!accessToken) {
      const { response, statusCode } = handleApiError(
        new AuthenticationError('Missing or invalid Authorization header. Expected: Bearer <token>')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    // 2. Create Supabase client with token
    const supabase = createSupabaseClientWithToken(accessToken)

    // 3. Verify token and get user session
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

    // 4. Verify user exists in database
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

    // 5. Parse and validate request body
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

    // 6. Validate request body with Zod schema
    const validatedBody = validate(notificationSchema, body)

    // 7. Verify all user_ids belong to riders
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, role')
      .in('id', validatedBody.user_ids)

    if (usersError) {
      logger.error('Failed to fetch users', usersError, {
        userIds: validatedBody.user_ids,
      })
      const { response, statusCode } = handleApiError(usersError)
      return NextResponse.json(response, { status: statusCode })
    }

    if (!users || users.length === 0) {
      const { response, statusCode } = handleApiError(
        new ValidationError('No users found with the provided user_ids.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    // Check if all users are riders
    const nonRiderUsers = users.filter((u) => u.role !== 'rider')
    if (nonRiderUsers.length > 0) {
      logger.warn('Non-rider users found in request', {
        nonRiderUserIds: nonRiderUsers.map((u) => u.id),
      })
      const { response, statusCode } = handleApiError(
        new ValidationError(
          `The following user_ids do not belong to riders: ${nonRiderUsers.map((u) => u.id).join(', ')}`
        )
      )
      return NextResponse.json(response, { status: statusCode })
    }

    // Check if all requested user_ids were found
    const foundUserIds = users.map((u) => u.id)
    const missingUserIds = validatedBody.user_ids.filter(
      (id) => !foundUserIds.includes(id)
    )
    if (missingUserIds.length > 0) {
      const { response, statusCode } = handleApiError(
        new ValidationError(
          `The following user_ids were not found: ${missingUserIds.join(', ')}`
        )
      )
      return NextResponse.json(response, { status: statusCode })
    }

    // 8. Send notifications via Firebase (using rider app project)
    const notificationResult = await sendNotificationsToUsers(
      validatedBody.user_ids,
      validatedBody.title,
      validatedBody.body,
      'rider',
      validatedBody.data
    )

    // 9. Optionally create notification records in database
    // This is useful for tracking and showing notifications in the app
    if (notificationResult.successCount > 0) {
      const notificationRecords = validatedBody.user_ids.map((userId) => ({
        user_id: userId,
        title: validatedBody.title,
        body: validatedBody.body,
        notification_type: validatedBody.notification_type || 'push',
        push_sent: true,
        push_sent_at: new Date().toISOString(),
      }))

      const { error: insertError } = await supabase
        .from('notifications')
        .insert(notificationRecords)

      if (insertError) {
        // Log but don't fail the request - notification was sent successfully
        logger.warn('Failed to create notification records', {
          error: insertError,
          userIds: validatedBody.user_ids,
        })
      }
    }

    // 10. Return success response
    logger.info('Notifications sent to riders', {
      requestedCount: validatedBody.user_ids.length,
      successCount: notificationResult.successCount,
      failureCount: notificationResult.failureCount,
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Notifications sent successfully',
        requestedCount: validatedBody.user_ids.length,
        successCount: notificationResult.successCount,
        failureCount: notificationResult.failureCount,
        invalidTokensRemoved: notificationResult.invalidTokens.length,
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error('Unexpected error sending notifications to riders', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
