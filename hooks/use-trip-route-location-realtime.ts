'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const ROUTE_QUERY_PREFIX = 'trip-route' as const
const DEBOUNCE_MS = 1000

/** Debounced invalidation so burst GPS inserts reuse `fetchTripRoute` + snap-to-road parity. */
export function useInvalidateTripRouteOnLocationInsert(opts: {
  tripId: string | undefined
  enabled: boolean
}) {
  const { tripId, enabled } = opts
  const queryClient = useQueryClient()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!tripId || !enabled) return

    const supabase = createClient()
    const channel = supabase
      .channel(`location_history_trip:${tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'location_history',
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => {
            debounceRef.current = null
            void queryClient.invalidateQueries({ queryKey: [ROUTE_QUERY_PREFIX, tripId] })
          }, DEBOUNCE_MS)
        }
      )
      .subscribe()

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      supabase.removeChannel(channel)
    }
  }, [tripId, enabled, queryClient])
}
