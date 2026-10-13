import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-service'
import { loadPanicConfig } from '@/lib/panic/config'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/panic/config — public. Lets the apps hide the SOS button when the
 * kill switch is off and cache the support numbers for their offline
 * SMS/call fallback. The kill switch is enforced server-side regardless.
 */
export async function GET() {
  try {
    const cfg = await loadPanicConfig(createServiceRoleClient())
    return NextResponse.json(
      {
        enabled: cfg.enabled,
        hold_ms: cfg.holdMs,
        support_numbers: cfg.supportNumbers,
        support_phone_display: cfg.supportDisplay,
        test_mode: cfg.testMode,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    logger.error('panic config failed', error)
    return NextResponse.json(
      { enabled: true, hold_ms: 3000, support_numbers: [], support_phone_display: '', test_mode: false },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
