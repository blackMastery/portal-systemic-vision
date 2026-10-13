import { NextResponse } from 'next/server'
import { loadTrackingSnapshot } from '@/lib/panic/tracking-loader'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * GET /api/track/[token] — public, token-gated live tracking data for the
 * emergency page. Polled by the page every 5s (30s in grace).
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const result = await loadTrackingSnapshot(params.token)
    if (result.kind === 'not_found') {
      return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404, headers: NO_STORE })
    }
    if (result.kind === 'expired') {
      return NextResponse.json({ state: 'expired', expires_at: result.expires_at }, { status: 410, headers: NO_STORE })
    }
    return NextResponse.json(result.snapshot, { headers: NO_STORE })
  } catch (error) {
    logger.error('tracking snapshot failed', error)
    return NextResponse.json({ error: 'Unavailable', code: 'INTERNAL' }, { status: 500, headers: NO_STORE })
  }
}
