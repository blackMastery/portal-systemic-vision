import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { handleApiError, AuthenticationError, NotFoundError, AuthorizationError } from '@/lib/errors'
import { validate, loginSchema } from '@/lib/validation'
import { logger } from '@/lib/logger'

// Create a Supabase client for server-side auth operations
function createSupabaseAuthClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    // 1. Parse and validate request body
    let body: unknown
    try {
      body = await request.json()
    } catch (error) {
      logger.error('Failed to parse request body', error)
      const { response, statusCode } = handleApiError(
        new Error('Invalid JSON in request body')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    // 2. Validate request body with Zod schema
    const validatedBody = validate(loginSchema, body)

    // 3. Create Supabase client for authentication
    const supabase = createSupabaseAuthClient()

    // 4. Authenticate with Supabase
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.signInWithPassword({
      email: validatedBody.email,
      password: validatedBody.password,
    })

    if (authError) {
      logger.warn('Authentication failed', { email: validatedBody.email, error: authError })
      const { response, statusCode } = handleApiError(
        new AuthenticationError('Invalid email or password')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    if (!authData.session || !authData.user) {
      logger.warn('No session created after authentication', { email: validatedBody.email })
      const { response, statusCode } = handleApiError(
        new AuthenticationError('Authentication failed. No session created.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    // 5. Get user profile from database
    const { data: userProfileData, error: userError } = await supabase
      .from('users')
      .select('id, role, full_name, email, phone_number, profile_photo_url')
      .eq('auth_id', authData.user.id)
      .single()

    if (userError || !userProfileData) {
      // Sign out if user profile not found
      await supabase.auth.signOut()
      logger.warn('User profile not found', { authId: authData.user.id, error: userError })
      const { response, statusCode } = handleApiError(
        new NotFoundError('User profile not found.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    // Type assertion for the selected fields
    const userProfile = userProfileData as Pick<
      Database['public']['Tables']['users']['Row'],
      'id' | 'role' | 'full_name' | 'email' | 'phone_number' | 'profile_photo_url'
    >

    // 6. Optional role verification
    if (validatedBody.role && userProfile.role !== validatedBody.role) {
      await supabase.auth.signOut()
      logger.warn('Role mismatch', {
        required: validatedBody.role,
        actual: userProfile.role,
        userId: userProfile.id,
      })
      const { response, statusCode } = handleApiError(
        new AuthorizationError(`Access denied. ${validatedBody.role} role required.`)
      )
      return NextResponse.json(response, { status: statusCode })
    }

    // 7. Return tokens and user information
    logger.info('Login successful', { userId: userProfile.id, role: userProfile.role })
    return NextResponse.json(
      {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_in: authData.session.expires_in,
        expires_at: authData.session.expires_at,
        token_type: authData.session.token_type,
        user: {
          id: userProfile.id,
          auth_id: authData.user.id,
          email: userProfile.email || authData.user.email,
          phone_number: userProfile.phone_number,
          full_name: userProfile.full_name,
          role: userProfile.role,
          profile_photo_url: userProfile.profile_photo_url,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error('Unexpected error during login', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}

