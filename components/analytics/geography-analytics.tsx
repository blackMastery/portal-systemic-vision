'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { haversineKm, topEntries } from '@/lib/stats'
import { formatCurrency, formatStatus } from '@/lib/format'
import type { AnalyticsDateRange } from '@/types/analytics-date-range'
import {
  getAnalyticsLandmarks,
  getSavedPlaceCounts,
  type AnalyticsLandmark,
} from '@/app/admin/analytics/actions'
import { ChartWrapper } from './chart-wrapper'
import { BarChart } from './charts/bar-chart'
import { PieChart } from './charts/pie-chart'
import { DemandMap, type DemandCell } from './charts/demand-map'
import { CHART_COLORS } from './chart-theme'
import { Bookmark, Map as MapIcon, MapPin, Navigation } from 'lucide-react'
import { MetricCard } from '@/components/dashboard/metric-card'

interface GeographyAnalyticsProps {
  dateRange: AnalyticsDateRange
}

type TripLocationRow = {
  requested_at: string
  status: string
  pickup_latitude: number | string | null
  pickup_longitude: number | string | null
  destination_latitude: number | string | null
  destination_longitude: number | string | null
  actual_fare: number | string | null
  estimated_fare: number | string | null
}

type RequestLocationRow = {
  created_at: string
  status: string
  expires_at: string | null
  pickup_latitude: number | string | null
  pickup_longitude: number | string | null
}

/** ~450 m cells: fine enough to separate neighbourhoods, coarse enough to pool volume. */
const GRID_DEGREES = 0.004

/** A pickup further than this from every landmark isn't attributed to an area. */
const MAX_AREA_MATCH_KM = 3

const UNMAPPED_AREA = 'Unmapped'

/**
 * Area names come from cost_estimate_landmarks. With none configured every
 * pickup resolves to "Unmapped", so these charts say so rather than rendering
 * a single meaningless bar.
 */
const LANDMARKS_REQUIRED =
  'Add landmarks under Cost Estimate Landmarks to break demand down by area'

function toCoord(value: number | string | null): number | null {
  if (value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toAmount(value: number | string | null): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Bucket points into a lat/lng grid, returning one cell per occupied square. */
function gridCells(points: { lat: number; lng: number }[]): DemandCell[] {
  const cells: Record<string, DemandCell> = {}
  for (const point of points) {
    const row = Math.floor(point.lat / GRID_DEGREES)
    const col = Math.floor(point.lng / GRID_DEGREES)
    const key = `${row}:${col}`
    if (!cells[key]) {
      cells[key] = {
        lat: (row + 0.5) * GRID_DEGREES,
        lng: (col + 0.5) * GRID_DEGREES,
        count: 0,
      }
    }
    cells[key].count++
  }
  return Object.values(cells).sort((a, b) => b.count - a.count)
}

/**
 * Name a coordinate by its nearest configured landmark's area. The landmark
 * table is small (tens to low hundreds), so a linear scan per point is cheap
 * next to the query that fetched the trips.
 */
function makeAreaResolver(landmarks: AnalyticsLandmark[]) {
  return (lat: number, lng: number): string => {
    let bestArea = UNMAPPED_AREA
    let bestDistance = MAX_AREA_MATCH_KM
    for (const landmark of landmarks) {
      const distance = haversineKm(lat, lng, landmark.lat, landmark.lng)
      if (distance < bestDistance) {
        bestDistance = distance
        bestArea = landmark.area || landmark.zone_code || landmark.name
      }
    }
    return bestArea
  }
}

async function fetchGeographyAnalytics(dateRange: AnalyticsDateRange) {
  const supabase = createClient()
  const startDate = dateRange.start?.toISOString()
  const endDate = dateRange.end.toISOString()

  const trips = await fetchAllRows<TripLocationRow>(() => {
    let query = supabase
      .from('trips')
      .select(
        'requested_at, status, pickup_latitude, pickup_longitude, destination_latitude, destination_longitude, actual_fare, estimated_fare'
      )
      .lte('requested_at', endDate)
      .order('requested_at', { ascending: true })
    if (startDate) query = query.gte('requested_at', startDate)
    return query
  })

  const requests = await fetchAllRows<RequestLocationRow>(() => {
    let query = supabase
      .from('trip_requests')
      .select('created_at, status, expires_at, pickup_latitude, pickup_longitude')
      .lte('created_at', endDate)
      .order('created_at', { ascending: true })
    if (startDate) query = query.gte('created_at', startDate)
    return query
  })

  // Reference data: current state, deliberately not date-filtered. Both tables
  // are unreadable from the browser client under RLS (cost_estimate_landmarks
  // has no policy; saved_places is owner-scoped), so they come from a server
  // action running as service role behind an admin check.
  const [landmarkResult, savedPlaceResult] = await Promise.all([
    getAnalyticsLandmarks(),
    getSavedPlaceCounts(),
  ])
  if (!landmarkResult.ok) throw new Error(landmarkResult.error)
  if (!savedPlaceResult.ok) throw new Error(savedPlaceResult.error)

  return {
    trips,
    requests,
    landmarks: landmarkResult.landmarks,
    savedPlaceCounts: savedPlaceResult.counts,
  }
}

export function GeographyAnalytics({ dateRange }: GeographyAnalyticsProps) {
  const [mapLayer, setMapLayer] = useState<'pickups' | 'unmet'>('pickups')

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'geography-analytics',
      dateRange.start?.toISOString() ?? 'all',
      dateRange.end.toISOString(),
    ],
    queryFn: () => fetchGeographyAnalytics(dateRange),
  })

  const derived = useMemo(() => {
    const trips = data?.trips ?? []
    const requests = data?.requests ?? []
    const landmarks = data?.landmarks ?? []
    const savedPlaceCounts = data?.savedPlaceCounts ?? []
    const resolveArea = makeAreaResolver(landmarks)

    const pickups: { lat: number; lng: number }[] = []
    const pickupAreaCounts: Record<string, number> = {}
    const routeStats: Record<string, { trips: number; fare: number; fareCount: number }> = {}

    for (const trip of trips) {
      const lat = toCoord(trip.pickup_latitude)
      const lng = toCoord(trip.pickup_longitude)
      if (lat === null || lng === null) continue
      pickups.push({ lat, lng })

      const pickupArea = resolveArea(lat, lng)
      pickupAreaCounts[pickupArea] = (pickupAreaCounts[pickupArea] ?? 0) + 1

      const destLat = toCoord(trip.destination_latitude)
      const destLng = toCoord(trip.destination_longitude)
      if (destLat === null || destLng === null) continue

      const key = `${pickupArea} → ${resolveArea(destLat, destLng)}`
      if (!routeStats[key]) routeStats[key] = { trips: 0, fare: 0, fareCount: 0 }
      routeStats[key].trips++
      const fare = toAmount(trip.actual_fare ?? trip.estimated_fare)
      if (fare > 0) {
        routeStats[key].fare += fare
        routeStats[key].fareCount++
      }
    }

    // Requests that timed out without ever becoming a trip — demand you lost,
    // matching the expiry definition used by the operational section.
    const now = Date.now()
    const unmet: { lat: number; lng: number }[] = []
    const unmetAreaCounts: Record<string, number> = {}
    for (const request of requests) {
      const expired =
        request.status === 'requested' &&
        request.expires_at !== null &&
        new Date(request.expires_at).getTime() < now
      if (!expired) continue
      const lat = toCoord(request.pickup_latitude)
      const lng = toCoord(request.pickup_longitude)
      if (lat === null || lng === null) continue
      unmet.push({ lat, lng })
      const area = resolveArea(lat, lng)
      unmetAreaCounts[area] = (unmetAreaCounts[area] ?? 0) + 1
    }

    const topRoutes = Object.entries(routeStats)
      .sort((a, b) => b[1].trips - a[1].trips)
      .slice(0, 10)
      .map(([route, stats]) => ({
        route,
        trips: stats.trips,
        avgFare: stats.fareCount > 0 ? stats.fare / stats.fareCount : 0,
      }))

    const topArea = topEntries(pickupAreaCounts, 1)[0]

    return {
      pickupCells: gridCells(pickups),
      unmetCells: gridCells(unmet),
      pickupAreaChart: topEntries(pickupAreaCounts, 10),
      unmetAreaChart: topEntries(unmetAreaCounts, 10),
      savedPlaceChart: savedPlaceCounts.map(entry => ({
        id: formatStatus(entry.label),
        value: entry.value,
      })),
      topRoutes,
      mappedPickups: pickups.length,
      unmappedTrips: trips.length - pickups.length,
      unmetCount: unmet.length,
      topAreaLabel: topArea?.label ?? '—',
      topAreaShare:
        topArea && pickups.length > 0 ? (topArea.value / pickups.length) * 100 : 0,
      areasServed: Object.keys(pickupAreaCounts).filter(a => a !== UNMAPPED_AREA).length,
      landmarkCount: landmarks.length,
      hasLandmarks: landmarks.length > 0,
    }
  }, [data])

  const activeCells = mapLayer === 'pickups' ? derived.pickupCells : derived.unmetCells

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <MapIcon className="h-6 w-6" />
        Geography &amp; Demand
      </h2>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Mapped Pickups"
          value={derived.mappedPickups.toLocaleString()}
          description={
            derived.unmappedTrips > 0
              ? `${derived.unmappedTrips.toLocaleString()} trips had no pickup coordinates`
              : 'Every trip in range has pickup coordinates'
          }
          icon={MapPin}
          color="blue"
        />
        <MetricCard
          title="Top Pickup Area"
          value={derived.hasLandmarks ? derived.topAreaLabel : '—'}
          description={
            derived.hasLandmarks
              ? `${derived.topAreaShare.toFixed(1)}% of mapped pickups`
              : 'Add cost estimate landmarks to name pickup areas'
          }
          icon={Navigation}
          color="purple"
        />
        <MetricCard
          title="Unmet Requests"
          value={derived.unmetCount.toLocaleString()}
          description="Requests that expired without a driver accepting"
          icon={MapPin}
          color="red"
        />
        <MetricCard
          title="Areas Served"
          value={derived.hasLandmarks ? derived.areasServed.toLocaleString() : '—'}
          description={
            derived.hasLandmarks
              ? `Matched against ${derived.landmarkCount.toLocaleString()} configured landmarks`
              : 'No landmarks configured yet'
          }
          icon={Bookmark}
          color="green"
        />
      </div>

      {/* Demand map */}
      <ChartWrapper
        title="Demand Map"
        description="Pickup density in ~450 m cells; circle size and shade scale with volume"
        isLoading={isLoading}
        isError={isError}
        isEmpty={derived.pickupCells.length === 0 && derived.unmetCells.length === 0}
        emptyMessage="No pickups with coordinates in this range"
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(
            [
              ['pickups', `Fulfilled pickups (${derived.mappedPickups.toLocaleString()})`],
              ['unmet', `Unmet requests (${derived.unmetCount.toLocaleString()})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMapLayer(value)}
              aria-pressed={mapLayer === value}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                mapLayer === value
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeCells.length === 0 ? (
          <div className="flex h-[420px] items-center justify-center rounded-lg bg-gray-50 text-gray-500">
            <p>
              No {mapLayer === 'pickups' ? 'pickups' : 'unmet requests'} with coordinates in this
              range
            </p>
          </div>
        ) : (
          <DemandMap
            cells={activeCells}
            color={mapLayer === 'pickups' ? CHART_COLORS.info : CHART_COLORS.danger}
            unit={mapLayer === 'pickups' ? 'pickup' : 'unmet request'}
          />
        )}
      </ChartWrapper>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:gap-6 lg:grid-cols-2">
        <ChartWrapper
          title="Top Pickup Areas"
          description="Trips by nearest landmark area"
          isLoading={isLoading}
          isError={isError}
          isEmpty={!derived.hasLandmarks || derived.pickupAreaChart.length === 0}
          emptyMessage={LANDMARKS_REQUIRED}
        >
          <BarChart data={derived.pickupAreaChart} maxXTicks={10} />
        </ChartWrapper>

        <ChartWrapper
          title="Unmet Demand by Area"
          description="Where expired requests are concentrated — candidates for more driver supply"
          isLoading={isLoading}
          isError={isError}
          isEmpty={!derived.hasLandmarks || derived.unmetAreaChart.length === 0}
          emptyMessage={
            derived.hasLandmarks
              ? 'No expired requests with coordinates in this range'
              : LANDMARKS_REQUIRED
          }
        >
          <BarChart data={derived.unmetAreaChart} color={CHART_COLORS.danger} maxXTicks={10} />
        </ChartWrapper>

        <ChartWrapper
          title="Top Routes"
          description="Most travelled area pairs and what they earn"
          isLoading={isLoading}
          isError={isError}
          isEmpty={!derived.hasLandmarks || derived.topRoutes.length === 0}
          emptyMessage={
            derived.hasLandmarks
              ? 'No trips with both pickup and destination coordinates'
              : LANDMARKS_REQUIRED
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Route
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Trips
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Avg fare
                  </th>
                </tr>
              </thead>
              <tbody>
                {derived.topRoutes.map(route => (
                  <tr key={route.route} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-4 text-gray-900">{route.route}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-gray-700">
                      {route.trips.toLocaleString()}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-700">
                      {formatCurrency(route.avgFare)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartWrapper>

        <ChartWrapper
          title="Saved Places by Type"
          description="All saved places on record — a proxy for the commuter base"
          isLoading={isLoading}
          isError={isError}
          isEmpty={derived.savedPlaceChart.length === 0}
        >
          <PieChart data={derived.savedPlaceChart} centerCaption="places" />
        </ChartWrapper>
      </div>
    </div>
  )
}
