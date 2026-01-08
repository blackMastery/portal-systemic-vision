import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = createServerClient()
  
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session) {
    // Check if user is admin
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('auth_id', session.user.id)
      .single()

    if (user && (user as { role: string }).role === 'admin') {
      redirect('/admin/dashboard')
    }
  }

  // Redirect to login if not authenticated or not admin
  redirect('/login')
}

