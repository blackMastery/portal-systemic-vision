/**
 * Google Roads API — Snap to Roads (batching ≤100 pts per HTTP request).
 * @see https://developers.google.com/maps/documentation/roads/snap
 */

const ROADS_SNAP_URL = 'https://roads.googleapis.com/v1/snapToRoads'
export const SNAP_TO_ROADS_MAX_POINTS_PER_REQUEST = 100

export type TripRouteSnapInput = { latitude: number; longitude: number; recorded_at: string }

type SnapApiPoint = {
  location: { latitude: number; longitude: number }
  originalIndex?: number
}

function chunkRanges(total: number, chunkSize: number, overlap: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let start = 0
  while (start < total) {
    const end = Math.min(start + chunkSize, total)
    ranges.push([start, end])
    if (end >= total) break
    start = Math.max(0, end - overlap)
  }
  return ranges
}

async function snapPathChunk(
  path: { latitude: number; longitude: number }[],
  apiKey: string,
  interpolate: boolean,
): Promise<SnapApiPoint[]> {
  if (path.length === 0) return []
  const pathParam = path.map((p) => `${p.latitude},${p.longitude}`).join('|')
  const params = new URLSearchParams({
    path: pathParam,
    interpolate: String(interpolate),
    key: apiKey,
  })
  const url = `${ROADS_SNAP_URL}?${params.toString()}`
  const res = await fetch(url, { cache: 'no-store' })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Roads snapToRoads failed (${res.status}): ${text.slice(0, 400)}`)
  }
  let data: { snappedPoints?: SnapApiPoint[]; error?: { message?: string } }
  try {
    data = JSON.parse(text) as { snappedPoints?: SnapApiPoint[]; error?: { message?: string } }
  } catch {
    throw new Error('Roads snapToRoads returned non-JSON')
  }
  if (data.error) {
    throw new Error(data.error.message || 'Roads snapToRoads error object')
  }
  return data.snappedPoints ?? []
}

/** Drop consecutive duplicates (sub-meter jitter) while keeping timestamps. */
function dedupeSequentialWithTime(points: TripRouteSnapInput[], epsSq = 1e-14): TripRouteSnapInput[] {
  const out: TripRouteSnapInput[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (
      last &&
      (last.latitude - p.latitude) ** 2 + (last.longitude - p.longitude) ** 2 < epsSq
    ) {
      continue
    }
    out.push(p)
  }
  return out
}

/** Map chunked `originalIndex` to global indices; merge overlapped snaps. */
function mergeSnappedChunks(
  chunked: Array<{ snapped: SnapApiPoint[]; rangeStart: number }>,
): Array<{ latitude: number; longitude: number; globalOriginalIndex: number | null }> {
  const merged: Array<{
    latitude: number
    longitude: number
    globalOriginalIndex: number | null
  }> = []

  for (let i = 0; i < chunked.length; i++) {
    const { snapped, rangeStart } = chunked[i]!
    const normalized = snapped.map((sp) => ({
      latitude: sp.location.latitude,
      longitude: sp.location.longitude,
      globalOriginalIndex:
        typeof sp.originalIndex === 'number' ? rangeStart + sp.originalIndex : null,
    }))
    if (i === 0) {
      merged.push(...normalized)
    } else if (normalized.length > 1) {
      merged.push(...normalized.slice(1))
    } else if (normalized.length === 1) {
      merged.push(normalized[0]!)
    }
  }
  return merged
}

function propagateRecordedAt(
  snapped: Array<{ latitude: number; longitude: number; globalOriginalIndex: number | null }>,
  originals: TripRouteSnapInput[],
): TripRouteSnapInput[] {
  let lastAt = originals[0]?.recorded_at ?? ''
  return snapped.map((p) => {
    if (
      p.globalOriginalIndex != null &&
      originals[p.globalOriginalIndex]?.recorded_at != null
    ) {
      lastAt = originals[p.globalOriginalIndex]!.recorded_at
    }
    return { latitude: p.latitude, longitude: p.longitude, recorded_at: lastAt }
  })
}

/** Snap GPS samples to roads; preserves ordering and propagates timestamps from originals. */
export async function snapTripRouteToRoads(
  originals: TripRouteSnapInput[],
  apiKey: string,
  interpolate = true,
): Promise<TripRouteSnapInput[]> {
  if (originals.length <= 1) return originals

  const latLngOnly = originals.map((o) => ({ latitude: o.latitude, longitude: o.longitude }))
  const ranges = chunkRanges(latLngOnly.length, SNAP_TO_ROADS_MAX_POINTS_PER_REQUEST, 1)

  const chunked: Array<{ snapped: SnapApiPoint[]; rangeStart: number }> = []
  for (const [start, end] of ranges) {
    const slice = latLngOnly.slice(start, end)
    const snapped = await snapPathChunk(slice, apiKey, interpolate)
    if (snapped.length === 0) {
      const identity: SnapApiPoint[] = slice.map((loc, idx) => ({
        location: { latitude: loc.latitude, longitude: loc.longitude },
        originalIndex: idx,
      }))
      chunked.push({ snapped: identity, rangeStart: start })
    } else {
      chunked.push({ snapped, rangeStart: start })
    }
  }

  const merged = mergeSnappedChunks(chunked)
  const withTimes = propagateRecordedAt(merged, originals)
  return dedupeSequentialWithTime(withTimes)
}
