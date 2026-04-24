import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function extractBearerToken(request: NextRequest): string | null {
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

function createSupabaseClientWithToken(accessToken: string) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type BearerUser = {
  id: string
  role: Database['public']['Tables']['users']['Row']['role']
  full_name: string
  is_active: boolean
}

export type ResolveBearerUserResult =
  | { ok: true; supabase: ReturnType<typeof createSupabaseClientWithToken>; user: BearerUser }
  | { ok: false; error: 'missing_token' | 'invalid_token' | 'user_not_found' }

/**
 * Resolves the app user (users row) from a Bearer access token.
 */
export async function resolveUserFromBearerRequest(
  request: NextRequest
): Promise<ResolveBearerUserResult> {
  const accessToken = extractBearerToken(request)
  if (!accessToken) {
    return { ok: false, error: 'missing_token' }
  }
  const supabase = createSupabaseClientWithToken(accessToken)
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !authUser) {
    return { ok: false, error: 'invalid_token' }
  }
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, role, full_name, is_active')
    .eq('auth_id', authUser.id)
    .single()
  if (userError || !user) {
    return { ok: false, error: 'user_not_found' }
  }
  return { ok: true, supabase, user }
}

export function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? null
  }
  return request.headers.get('x-real-ip')
}
