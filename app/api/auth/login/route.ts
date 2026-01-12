import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

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

interface LoginRequestBody {
  email: string
  password: string
  role?: 'admin' | 'rider' | 'driver' // Optional role verification
}

export async function POST(request: NextRequest) {
  try {
    // 1. Parse request body
    let body: LoginRequestBody
    try {
      body = await request.json()
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body.' },
        { status: 400 }
      )
    }

    // 2. Validate required fields
    if (!body.email || !body.password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      )
    }

    // 3. Create Supabase client for authentication
    const supabase = createSupabaseAuthClient()

    // 4. Authenticate with Supabase
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    })

    if (authError) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      )
    }

    if (!authData.session || !authData.user) {
      return NextResponse.json(
        { error: 'Authentication failed. No session created.' },
        { status: 401 }
      )
    }

    // 5. Get user profile from database
    const { data: userProfile, error: userError } = await supabase
      .from('users')
      .select('id, role, full_name, email, phone_number, profile_photo_url')
      .eq('auth_id', authData.user.id)
      .single()

    if (userError || !userProfile) {
      // Sign out if user profile not found
      await supabase.auth.signOut()
      return NextResponse.json(
        { error: 'User profile not found.' },
        { status: 404 }
      )
    }

    // 6. Optional role verification
    if (body.role && userProfile.role !== body.role) {
      await supabase.auth.signOut()
      return NextResponse.json(
        {
          error: `Access denied. ${body.role} role required.`,
          user_role: userProfile.role,
        },
        { status: 403 }
      )
    }

    // 7. Return tokens and user information
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
  } catch (error: any) {
    console.error('Unexpected error during login:', error)
    return NextResponse.json(
      {
        error: 'An unexpected error occurred during login.',
        details: error.message,
      },
      { status: 500 }
    )
  }
}

