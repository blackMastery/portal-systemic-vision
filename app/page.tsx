'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function HomePage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
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
          router.push('/admin/dashboard')
          return
        }
      }

      // Redirect to login if not authenticated or not admin
      router.push('/login')
    }

    checkAuthAndRedirect()
  }, [router, supabase])

  // Show loading state while checking auth
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  )
}

