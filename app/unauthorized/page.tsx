import Link from 'next/link'
import { Shield, Home, LogIn } from 'lucide-react'

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-2xl p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-red-100 p-3">
            <Shield className="h-8 w-8 text-red-600" />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Access Denied
        </h1>
        
        <p className="text-gray-600 mb-2">
          You don&apos;t have permission to access this resource.
        </p>
        
        <p className="text-sm text-gray-500 mb-6">
          Admin access is required to view this page.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Sign in as Admin
          </Link>
          
          <Link
            href="/"
            className="flex items-center justify-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Home className="h-4 w-4 mr-2" />
            Go to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
