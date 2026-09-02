import type { Database } from '@/types/database'
import { trackingUrl } from './messages'

type PanicAlertRow = Database['public']['Tables']['panic_alerts']['Row']

/** Public view of an alert for the mobile apps (no phone numbers). */
export function publicAlert(alert: PanicAlertRow) {
  return {
    id: alert.id,
    trip_id: alert.trip_id,
    incident_id: alert.incident_id,
    status: alert.status,
    role: alert.role,
    created_at: alert.created_at,
    expires_at: alert.expires_at,
    resolved_at: alert.resolved_at,
    tracking_url: trackingUrl(alert.tracking_token),
    test_mode: alert.test_mode,
  }
}
