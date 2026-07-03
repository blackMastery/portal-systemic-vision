# KPI Recommendations — Links Platform

Status: recommendation + implementation plan, not yet built. (Saved 2026-07-03 for later.)

Business model context: revenue comes from driver/rider subscriptions paid via MMG; trips are cash, no per-trip commission. So driver subscription health and marketplace matching are the KPIs that most directly move revenue.

**Suggested north star: weekly completed trips** — it captures supply, demand, and matching quality in one number.

## A. Already tracked (no work needed)

| KPI | Where |
|---|---|
| Completion rate, avg fare, trip revenue | `components/analytics/trip-analytics.tsx` |
| Avg response time, request expiration rate, peak hour | `components/analytics/operational-analytics.tsx` |
| Subscription revenue, MMG payment success rate | `components/analytics/financial-analytics.tsx`, `/admin/payments` |
| New riders/drivers, active users, growth | `components/analytics/user-analytics.tsx` |
| Trial→paid conversion, churn, avg subscription value | `components/analytics/rider-analytics.tsx`, `subscription-analytics.tsx` |
| Active / expiring / idle subscribed drivers | `/admin/dashboard` cards |

## B. Trackable today with existing data, not yet computed

Quick wins marked ⭐ are the recommended first implementation batch.

| KPI | Formula | Source tables |
|---|---|---|
| ⭐ Request fulfillment rate | requests with ≥1 trip ÷ all requests | `trip_requests` joined via `trips.request_id` |
| ⭐ Median / p90 time-to-accept | percentiles of `accepted_at − requested_at` | `trips` |
| ⭐ Cancellation rate, split rider vs driver | cancelled ÷ (completed + cancelled); attribute via `cancelled_by_user_id` vs rider/driver `user_id` | `trips` |
| ⭐ Driver activation rate | subscribed drivers with ≥1 accepted trip in period ÷ all subscribed drivers | `driver_profiles` + `trips` |
| ⭐ Repeat rider rate | riders with ≥2 completed trips ÷ riders with ≥1 | `trips` |
| ⭐ Incidents per 100 completed trips | incidents ÷ completed trips × 100 | `incidents` + `trips` |
| Subscription renewal rate | subs expiring in period followed by a new sub ≤7 days later, same user | `subscriptions` |
| Median incident resolution time | `resolved_at − created_at` | `incidents`, `incident_status_history` |
| Fare estimate accuracy | avg(`actual_fare ÷ estimated_fare`) | `trips` |
| % trips rated / low-rating queue volume | non-null ratings ÷ completed; open queue rows | `trips`, `rating_review_queue` |
| Dashcam compliance | submitted before `deadline_at` ÷ requested | `dashcam_requests` |

## C. Needs new instrumentation (roadmap)

- **Driver supply hours** — aggregate `location_history.is_online` into a daily rollup (or add a session table); unlocks true utilization = trip time ÷ online time.
- **Structured cancellation reasons** — `trips.cancellation_reason` is free text; add an enum so reasons can be aggregated.
- **Zone-level supply/demand** — map trip pickups to zones (`cost_estimate_zones` exists but serves cost estimates, not ops).
- **Rider engagement events** — `users.last_seen_at` is a weak proxy; a real funnel needs app-side event tracking.

## Implementation plan for the ⭐ quick wins

Add a **"Marketplace KPIs" section at the top of `/admin/analytics`**, following the existing section pattern.

1. **New `components/analytics/marketplace-kpis.tsx`** — copy the structure of `operational-analytics.tsx` (`useQuery` + `createClient`, `dateRange: { start: Date; end: Date }` prop, `MetricCard` tiles, `ChartWrapper` + recharts). Fetch in one `Promise.all`, all filtered to the date range:
   - `trip_requests`: `id, created_at, status`
   - `trips`: `request_id, status, requested_at, accepted_at, cancelled_at, cancelled_by_user_id, rider_id, driver_id, rider:rider_id(user_id), driver:driver_id(user_id)` (filter on `requested_at`)
   - `driver_profiles` with `subscription_status = 'active'`: `id` (activation denominator)
   - `incidents`: count in range

   Render 6 tiles (fulfillment, median/p90 accept time, cancellation split, driver activation, repeat riders, incident rate) + 2 charts (daily fulfillment-rate line; daily cancellations stacked bar by rider/driver/unattributed).

2. **Edit `app/admin/analytics/page.tsx`** — render `<MarketplaceKpis dateRange={dateRangeValue} />` first in the sections list.

3. **Edit `types/database.ts`** — add `request_id: string | null` and `cancelled_by_user_id: string | null` to the `trips` Row. Both columns exist in the DB (`supabase/migrations/20260406154103_remote_schema.sql:226,259`) but are missing from the types.

### Verification
- `npx tsc --noEmit` clean.
- Load `/admin/analytics`, switch 7d/30d/90d/all ranges; tiles and charts update.
- Cross-check: cancellation counts match trip-analytics status breakdown; fulfilled + expired + still-pending requests ≈ 100%.
