# Allowlisted colour changes

Stage A is meant to be a provable no-op — `color-signature.js --diff` should
report zero changes. Every exception is recorded here with a reason. Anything
in a diff that is *not* on this list is a bug.

> Run the diff with the **same script version on both sides**. `git stash`
> stashes the scripts too; use `git stash push -- app components` so only the
> source moves.

## Phase 6 — brand blue → tokens

525 sites migrated. 476 were exact no-ops. The 49 below are deliberate
consolidations: the app had accumulated near-duplicate shades for one job, and
the token set collapses them.

| # sites | Change | Reason |
|---|---|---|
| 19 | `hover:text-blue-700/800/900` → `hover:text-primary-hover` (blue-700) | Three shades for one hover state. Collapsed to the brand hover token. |
| 6 | `text-blue-700`, `text-blue-500` → `text-primary-strong` (blue-600) | Brand ink was drifting across three shades. |
| 8 | `border-blue-200/300` → `border-primary-soft-deep` (blue-100) | Soft-banner borders. Two shades for one job. |
| 6 | `bg-amber-100` → `bg-warning-soft` (yellow-100), `text-amber-800` → `text-warning-soft-foreground` (yellow-800) | **Amber does not survive.** At hue 38° it is indistinguishable from the brand orange (hue 31°) once Stage B lands. Warning is pinned to the yellow ramp (hue 45–55°) so it stays a distinct signal. |
| 6 | `bg-indigo-100` → `bg-violet-soft` (purple-100), `text-indigo-800` → `text-violet-soft-foreground` (purple-800) | Indigo and purple both encoded "categorical, no fixed meaning" (picked_up, escalated, airport). Merged into one `violet` family. |
| 4 | `bg-blue-400` → `bg-info`/`bg-primary` (blue-600), `hover:ring-blue-400` → `ring-ring` (blue-500) | Status dot and a disabled fill were 2 steps lighter than every other brand blue. |

### Not a change, despite appearances

`--tw-gradient-from`/`to` values flip from bare hex (`#eff6ff`) to `rgb(...)`
notation because Tailwind writes palette stops as hex and token stops as
`hsl(var(--x))`. `canonicalColor()` normalises both to rgb, so these are
reported as identical. If you see a gradient in a diff, the colour really did
change.
