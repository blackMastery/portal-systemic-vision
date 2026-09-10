# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Links Admin Panel: the operations dashboard for the Links 592 ride-hailing platform (Guyana). It also hosts the HTTP API consumed by the separate driver and rider mobile apps. Next.js 14 App Router, TypeScript (strict), Supabase (Postgres + Auth + Realtime), Tailwind, TanStack Query.

## Commands

```bash
npm run dev          # next dev on :3000
npm run build        # next build (run before pushing; catches RSC/route errors)
npm run type-check   # tsc --noEmit
npm run lint         # next lint (next/core-web-vitals only)
```

There is no test runner in this repo. Verification is `npm run build && npm run type-check && npm run lint`.

Design-token gates (only when touching colour classes, see "Design tokens" below):

```bash
node scripts/migration/verify-classes.js        # every Tailwind class in source emits CSS
node scripts/migration/color-signature.js       # per-file colour signature; --diff a b to compare
```

Env vars are documented in `.env.example` (local file is `.env`, gitignored). `types/database.ts` is hand-maintained, not generated; update it by hand when the schema changes.

Database schema and migrations live in the sibling repo `../links592db/supabase/migrations` (also `schema.sql` there). Write migration files there when a change needs schema; the user applies them themselves, so never run `supabase db push` / `db reset`.

## Architecture

### Three auth surfaces

1. **Admin UI (cookie session).** `middleware.ts` guards `/admin/*`, `/login`, `/api/admin/*`: it reads the Supabase session cookie, looks up `users.role` by `auth_id`, and redirects non-admins to `/unauthorized`. Admin pages are `'use client'` components that query Supabase directly from the browser via `lib/supabase/client.ts` with TanStack Query (see `app/providers.tsx` for retry policy). Root layout is `force-dynamic`.
2. **Mobile API (Bearer token).** Routes under `app/api/*` that the apps call authenticate with `Authorization: Bearer <supabase access token>`. Use `resolveUserFromBearerRequest` from `lib/bearer-api.ts`; it returns a token-scoped client plus the `users` row (`id`, `role`, `full_name`, `is_active`). Older routes (`trip-requests`, `trips/[id]/*`, `notifications/*`, `sms/send`) still carry inline copies of that logic; new routes must use the shared helper, and refactor toward it when touching old ones.
3. **Public.** `/track/[token]` (panic live tracking page, server component), `GET /api/track/[token]`, `GET /api/panic/config`, `GET /api/app/version`, `GET /api/agreements/current`, MMG payment return pages and webhook.

### Supabase client flavours

- `lib/supabase/client.ts` — browser, cookie session. Used by admin pages/components/hooks.
- `lib/supabase/server.ts` / `createRouteHandlerClient` / `createServerActionClient` — server, cookie session. Used to *verify the caller is an admin* in route handlers and server actions.
- `lib/supabase-service.ts` `createServiceRoleClient()` — bypasses RLS, server only. Used for privileged writes after the caller has been verified, and by Bearer routes for cross-table reads.

Server actions (`app/admin/**/actions.ts`, `'use server'`) follow one pattern: verify admin via cookie client, then do the work with a service client, then log via `logger`. Several files define their own local `createServiceClient()`; prefer importing `createServiceRoleClient`.

Trips reference **profile ids**, not user ids: `trips.driver_id -> driver_profiles.id`, `trips.rider_id -> rider_profiles.id`, and each profile has `user_id -> users.id`. `lib/incidents/verify-trip-participant.ts` shows the correct join when checking that a Bearer user belongs to a trip.

PostgREST caps responses at 1000 rows. Use `fetchAllRows` from `lib/supabase/fetch-all.ts` (with a deterministic `.order`) for anything that lists a whole table.

### API route conventions

- Validate bodies with `validate(schema, body)` from `lib/validation.ts` (Zod schemas live there, one per endpoint).
- Throw/return `AppError` subclasses from `lib/errors.ts` (`AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ConflictError`, `ValidationError`) and convert with `handleApiError(err)` → `NextResponse.json(response, { status })`. It maps PostgREST `PGRST116` to 404 and `23505` to 409 and sanitises messages in production.
- Log with `logger` from `lib/logger.ts`, not `console`.
- Every mobile-facing endpoint has a spec in `docs/api/*.md`. Update the doc when changing request/response shapes; the app developers read those.

### Feature flags and config in `system_config`

`system_config` is a key → JSON value table. Runtime toggles read from it with **fail-open** semantics (missing or malformed row logs a warning and enables the feature): `trip_requests` (`{"enabled"}`), `panic_button_enabled`, `panic_support_numbers`, `panic_test_mode`. Precedence is `system_config` > env var > built-in default (see `lib/panic/config.ts`). Mobile app version gates live in `app_version_config` and are edited under Admin → Settings.

### Subsystems worth knowing before editing

- **Panic / SOS** (`lib/panic/*`, `app/api/panic/*`, `app/track/*`, `components/admin/panic-alert-banner.tsx`). `POST /api/panic` creates an `incidents` row plus a `panic_alerts` row atomically through the `create_panic_alert` RPC, idempotent on `idempotency_key`. SMS fan-out via Twilio is guarded by a compare-and-set claim (`claimDispatch`) so retries never double-send. The admin banner subscribes to `panic_alerts` via Supabase Realtime. Full behaviour and recipient rules: `docs/api/panic.md`. Keep `PANIC_TEST_MODE=true` locally.
- **Push notifications** (`lib/firebase/*`). Two separate Firebase projects, `driver` and `rider`; pick the project by which app registered the FCM token. Credentials come from `FIREBASE_{DRIVER,RIDER}_SERVICE_ACCOUNT_{KEY,PATH}`.
- **Agreements** (`lib/agreements.ts`, `app/api/agreements/*`, Admin → Settings). Versioned legal text per audience (`driver`/`rider`); `requires_acceptance` is derived by comparing the current published `agreement_versions` row to `agreement_acceptances`, not stored. Acceptance generates a PDF with `pdf-lib` into the `agreement_pdfs` bucket. `pdf-lib` is excluded from bundling in `next.config.js`; keep it that way. `assertCurrentAgreementAccepted` gates trip creation.
- **Payments (MMG)** (`lib/mmg.ts`, `lib/encryption.ts`, `app/api/mmg/*`). Subscription payments via MMG checkout redirect: RSA-OAEP encrypted checkout token, then `confirm-payment` verifies through MMG's e-commerce lookup API. Revenue is subscriptions only; trips are cash with no commission (see `docs/kpi-recommendations.md`).
- **Trip route maps** (`lib/admin/fetch-trip-route.ts`, `app/api/maps/snap-to-road`, `hooks/use-trip-route-location-realtime.ts`). Location history is fetched client-side, optionally snapped via Google Roads API server-side, and invalidated on Realtime `location_history` inserts with a 1s debounce.
- **Admin list pages** keep all filter state in URL search params through per-page hooks (`use-driver-filters.ts`, `use-trip-filters.ts`, `use-trip-request-filters.ts`). Follow that pattern for new filterable lists.
- **Analytics** charts are Nivo (`components/analytics/charts/*` wrap `@nivo/*` with `chart-theme.ts`). Recharts was removed; do not reintroduce it.

### Time zones

Everything user-facing is Guyana time (UTC−4, no DST). Use `lib/guyana-time.ts` (`formatGuyana`, `guyanaDayStart/End`, `parseApiTimestamptz`) rather than raw `date-fns` for anything shown to admins or used in date-range queries. Zone-less timestamps from the API are treated as Guyana wall time. `location_history.recorded_at` is special: driver apps send local time with a bogus `Z`, and the default (`NEXT_PUBLIC_LOCATION_RECORDED_AT_AS_GUYANA_WALL` unset) reinterprets it as wall time.

Phone numbers: normalise with `normalizeToE164Guyana` from `lib/sms/twilio.ts`.

### Design tokens (colour)

`app/globals.css` is the single source of truth for colour; `tailwind.config.ts` maps semantic names onto those CSS variables. Rules that the migration tooling in `scripts/migration/` enforces:

- Use semantic classes (`bg-card`, `text-foreground-muted`, `border-border`, `bg-primary-soft`, `text-danger-soft-foreground`, ...). Do not add raw palette classes (`bg-blue-600`, `text-gray-500`, `bg-amber-100`).
- `primary` (brand orange) is a **fill only**; it fails contrast for text/icons/strokes. Use `primary-strong` for links, icons and rings, and `primary-foreground` (dark ink) on a primary fill. Never white on primary.
- Status colours (`success`, `warning`, `danger`, `info`, `violet`) mean status, not brand. Warning is the yellow ramp because amber is indistinguishable from the brand orange.
- Never build class names by interpolation (`` `bg-${tone}-soft` ``); use literal lookup objects. Tailwind scans `app`, `components`, `lib`, `hooks`.
- `darkMode: 'class'` is set only so stray `dark:` utilities stay inert; there is no dark theme.

## Stale docs

`README.md`, `QUICKSTART.md` and `SETUP_GUIDE.md` predate most of the app (they list Recharts, describe riders/trips/payments pages as "to be built", and reference a schema file that is not in this repo). Trust the code and `docs/` over them. `docs.md` is the original product brief for the safety features (agreements, incidents, panic, suspensions). `DATABASE_DESIGN_GUIDE.md` is a long reference on the schema and RLS design.
