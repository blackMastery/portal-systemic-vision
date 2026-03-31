import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  handleApiError,
  AuthenticationError,
  ValidationError,
} from '@/lib/errors'
import { logger } from '@/lib/logger'

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

export async function POST(request: NextRequest) {
  try {
    const accessToken = extractBearerToken(request)
    if (!accessToken) {
      const { response, statusCode } = handleApiError(
        new AuthenticationError('Missing or invalid Authorization header. Expected: Bearer <token>')
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
    } catch {
      const { response, statusCode } = handleApiError(new Error('Invalid JSON in request body.'))
      return NextResponse.json(response, { status: statusCode })
    }

    const { to, message } = body as { to?: string; message?: string }

    if (!to || typeof to !== 'string' || to.trim() === '') {
      const { response, statusCode } = handleApiError(new ValidationError('Missing required field: to (phone number)'))
      return NextResponse.json(response, { status: statusCode })
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      const { response, statusCode } = handleApiError(new ValidationError('Missing required field: message'))
      return NextResponse.json(response, { status: statusCode })
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = process.env.TWILIO_FROM_NUMBER

    if (!accountSid || !authToken || !fromNumber) {
      logger.error('Missing Twilio environment variables')
      const { response, statusCode } = handleApiError(new Error('SMS service is not configured.'))
      return NextResponse.json(response, { status: statusCode })
    }

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`

    const twilioBody = new URLSearchParams({
      To: to.trim(),
      From: fromNumber,
      Body: message.trim(),
    })

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: twilioBody.toString(),
    })

    const twilioData = await twilioResponse.json() as { sid?: string; message?: string; code?: number }

    if (!twilioResponse.ok) {
      logger.error('Twilio API error', { status: twilioResponse.status, data: twilioData })
      const { response, statusCode } = handleApiError(
        new Error(twilioData.message || 'Failed to send SMS.')
      )
      return NextResponse.json(response, { status: statusCode })
    }

    logger.info('SMS sent successfully', { to: to.trim(), messageSid: twilioData.sid })

    return NextResponse.json(
      { success: true, messageSid: twilioData.sid },
      { status: 200 }
    )
  } catch (error) {
    logger.error('Unexpected error sending SMS', error)
    const { response, statusCode } = handleApiError(error)
    return NextResponse.json(response, { status: statusCode })
  }
}
