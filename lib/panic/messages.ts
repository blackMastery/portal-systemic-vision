import { formatGuyana } from '@/lib/guyana-time'

/** Everything the templates might need; missing values drop their line. */
export type PanicMessageContext = {
  role: 'rider' | 'driver'
  presserName: string
  presserPhone: string | null
  tripId: string
  pickupAddress: string | null
  destinationAddress: string | null
  riderName: string | null
  riderPhone: string | null
  driverName: string | null
  driverPhone: string | null
  vehicleColor: string | null
  vehicleMake: string | null
  vehicleModel: string | null
  vehiclePlate: string | null
  latitude: number | null
  longitude: number | null
  accuracyMeters: number | null
  trackingToken: string
  incidentId: string
  supportDisplay: string
  pressedAt: Date
  /** Origin the portal was reached on (see [requestOrigin]); links are built from it. */
  baseUrl: string
  /** False when the rider booked for someone else and is not in the vehicle. */
  riderIsPassenger: boolean
}

const HOST_RE = /^[A-Za-z0-9.-]+(:\d{1,5})?$/

/** Fallback when no request is available: NEXT_PUBLIC_APP_URL, then localhost. */
export function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

/**
 * The address this request reached the portal on (e.g. `https://portal.example.com`),
 * so SMS and API links point at the deployment that is actually serving.
 * Honors the proxy's `x-forwarded-host` / `x-forwarded-proto` (Vercel sets both).
 */
export function requestOrigin(request: Request): string {
  const headers = request.headers
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? '').split(',')[0].trim()
  if (host && HOST_RE.test(host)) {
    const forwardedProto = (headers.get('x-forwarded-proto') ?? '').split(',')[0].trim()
    const proto =
      forwardedProto === 'http' || forwardedProto === 'https'
        ? forwardedProto
        : new URL(request.url).protocol.replace(':', '')
    return `${proto}://${host}`
  }
  try {
    return new URL(request.url).origin
  } catch {
    return baseUrl()
  }
}

export function mapsPinUrl(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`
}

export function trackingUrl(token: string, origin: string = baseUrl()): string {
  return `${origin.replace(/\/+$/, '')}/track/${token}`
}

export function adminIncidentUrl(incidentId: string, origin: string = baseUrl()): string {
  return `${origin.replace(/\/+$/, '')}/admin/incidents/${incidentId}`
}

export function guyanaStamp(d: Date): string {
  return formatGuyana(d, 'd MMM HH:mm')
}

/** GSM-7 friendly: strip characters that would force UCS-2 segments. */
function ascii(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E\n]/g, '')
}

function clip(s: string | null | undefined, max: number): string {
  const v = (s ?? '').trim()
  if (!v) return ''
  return v.length <= max ? v : `${v.slice(0, max - 1)}~`
}

function vehicleLine(c: PanicMessageContext): string {
  return [c.vehicleColor, c.vehicleMake, c.vehicleModel].filter((p) => p && p.trim()).join(' ')
}

function trip8(id: string): string {
  return id.slice(0, 8)
}

export function buildAlertSmsForSupport(c: PanicMessageContext): string {
  const lines: string[] = []
  const stamp = guyanaStamp(c.pressedAt)
  const presserPhone = c.presserPhone ? ` ${c.presserPhone}` : ''
  if (c.role === 'rider') {
    const who = c.riderIsPassenger ? 'rider' : 'rider, booked for a passenger'
    lines.push(`LINKS PANIC (${who}) ${stamp}: ${c.presserName}${presserPhone} on trip ${trip8(c.tripId)}.`)
    const driverBits = [c.driverName, c.driverPhone].filter(Boolean).join(' ')
    const veh = [vehicleLine(c), c.vehiclePlate].filter(Boolean).join(' ')
    if (driverBits || veh) lines.push(`Driver: ${[driverBits, veh].filter(Boolean).join(', ')}.`)
  } else {
    const veh = [vehicleLine(c), c.vehiclePlate].filter(Boolean).join(' ')
    lines.push(
      `LINKS PANIC (driver) ${stamp}: ${c.presserName}${presserPhone} on trip ${trip8(c.tripId)}${veh ? `, ${veh}` : ''}.`
    )
    const riderBits = [c.riderName, c.riderPhone].filter(Boolean).join(' ')
    if (riderBits) lines.push(`Rider: ${riderBits}.`)
  }
  const from = clip(c.pickupAddress, 40)
  const to = clip(c.destinationAddress, 40)
  if (from || to) lines.push([from && `From: ${from}.`, to && `To: ${to}.`].filter(Boolean).join(' '))
  if (c.latitude != null && c.longitude != null) lines.push(`Pin: ${mapsPinUrl(c.latitude, c.longitude)}`)
  lines.push(`Track: ${trackingUrl(c.trackingToken, c.baseUrl)}`)
  lines.push(`Admin: ${adminIncidentUrl(c.incidentId, c.baseUrl)}`)
  return ascii(lines.join('\n'))
}

/** Personal emergency contact: no phone numbers, no trip id, no admin link. */
export function buildAlertSmsForContact(c: PanicMessageContext): string {
  const lines: string[] = []
  lines.push(
    c.role === 'rider' && !c.riderIsPassenger
      ? `LINKS SAFETY ALERT: ${c.presserName} pressed the panic button for a Links ride they booked for someone else, at ${guyanaStamp(c.pressedAt)}.`
      : `LINKS SAFETY ALERT: ${c.presserName} pressed the panic button during a Links ride at ${guyanaStamp(c.pressedAt)}.`
  )
  const veh = vehicleLine(c)
  const driverParts = [c.driverName, veh, c.vehiclePlate ? `plate ${c.vehiclePlate}` : ''].filter(Boolean)
  if (driverParts.length) lines.push(`Driver: ${driverParts.join(', ')}.`)
  lines.push(`Live location: ${trackingUrl(c.trackingToken, c.baseUrl)}`)
  if (c.supportDisplay) lines.push(`Links support: ${c.supportDisplay}`)
  return ascii(lines.join('\n'))
}

export function buildSafeSms(
  c: Pick<PanicMessageContext, 'presserName' | 'tripId' | 'trackingToken' | 'baseUrl'>,
  audience: 'support' | 'emergency_contact',
  resolvedAt: Date
): string {
  const tripPart = audience === 'support' ? ` (trip ${trip8(c.tripId)})` : ''
  return ascii(
    `LINKS: ${c.presserName} marked themselves SAFE at ${guyanaStamp(resolvedAt)}${tripPart}. Alert resolved. Location link stays available for 1 hour: ${trackingUrl(c.trackingToken, c.baseUrl)}`
  )
}

export function buildIncidentDescription(
  c: Pick<PanicMessageContext, 'role' | 'presserName' | 'tripId' | 'latitude' | 'longitude' | 'accuracyMeters' | 'pressedAt'>
): string {
  const loc =
    c.latitude != null && c.longitude != null
      ? `Press location: ${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}${c.accuracyMeters != null ? ` (accuracy ${Math.round(c.accuracyMeters)} m)` : ''}.`
      : 'Press location: unavailable.'
  return `PANIC BUTTON pressed by ${c.role} ${c.presserName} at ${guyanaStamp(c.pressedAt)} Guyana time during trip ${c.tripId}. ${loc} Auto-generated by the panic system; see panic_alerts.`
}
