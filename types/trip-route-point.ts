/** GPS sample for displaying a trip route (DB `location_history` / snapped polyline points). */
export type TripRoutePoint = {
  latitude: number
  longitude: number
  recorded_at: string
}
