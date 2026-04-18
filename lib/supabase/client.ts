import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Database } from '@/types/database'

// Client component client
export const createClient = () => {
  return createClientComponentClient()
}
