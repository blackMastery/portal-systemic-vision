import type { Metadata } from 'next'
import { loadTrackingSnapshot } from '@/lib/panic/tracking-loader'
import { LiveTrackingView } from '@/components/track/live-tracking-view'
import { formatGuyana } from '@/lib/guyana-time'

export const metadata: Metadata = {
  title: 'Links live tracking',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-gray-800 text-white px-4 py-3">
        <p className="text-sm font-semibold tracking-wide">Links live tracking</p>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center space-y-2">
          {children}
        </div>
      </div>
    </main>
  )
}

/**
 * Public, token-gated emergency tracking page. No login, no admin chrome.
 * `/track/*` is outside the auth middleware matcher.
 */
export default async function TrackPage({ params }: { params: { token: string } }) {
  const result = await loadTrackingSnapshot(params.token)

  if (result.kind === 'not_found') {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-gray-900">Link not found</h1>
        <p className="text-sm text-gray-600">
          This tracking link is invalid. Check the link in the message you received.
        </p>
      </Shell>
    )
  }

  if (result.kind === 'expired') {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-gray-900">This tracking link has expired</h1>
        <p className="text-sm text-gray-600">
          Location sharing for this alert ended on{' '}
          {formatGuyana(result.expires_at, 'd MMM yyyy, HH:mm')} (Guyana time).
        </p>
      </Shell>
    )
  }

  return <LiveTrackingView token={params.token} initial={result.snapshot} />
}
