import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { snapTripRouteToRoads, type TripRouteSnapInput } from '@/lib/maps/snap-to-roads'

const bodySchema = z.object({
  points: z
    .array(
      z.object({
        latitude: z.number().finite(),
        longitude: z.number().finite(),
        recorded_at: z.string().min(1),
      }),
    )
    .max(8000),
})

function roadsApiKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    null
  )
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: row, error: userErr } = await supabase
    .from('users')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (userErr || !row || (row as { role: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const key = roadsApiKey()
  if (!key) {
    return NextResponse.json(
      { error: 'Missing Google Maps API key for Roads snapping.' },
      { status: 503 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const originals = parsed.data.points as TripRouteSnapInput[]

  if (originals.length === 0) {
    return NextResponse.json({ points: [], snapped: false })
  }

  try {
    const points =
      originals.length === 1 ? originals : await snapTripRouteToRoads(originals, key)
    return NextResponse.json({ points, snapped: originals.length > 1 })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[api/maps/snap-to-road]', message)
    return NextResponse.json({
      points: originals,
      snapped: false,
      warning: message,
    })
  }
}
