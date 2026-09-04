import { createClient } from '@/lib/supabase/client'

/**
 * The signed-in admin's `public.users.id` (not their `auth.users.id`).
 *
 * This is a UI-affordance lookup only — use it to decide what to show, never as an
 * authorization boundary. Ownership is enforced server-side in the note actions.
 */
export async function fetchCurrentAdminUserId(): Promise<string | null> {
  const supabase = createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', authUser.id)
    .single()

  if (error) return null
  return (data as { id: string } | null)?.id ?? null
}
