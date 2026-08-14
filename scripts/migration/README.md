# Design-token migration tooling

Moves the portal off 3,219 hardcoded Tailwind palette classes onto semantic
tokens, then re-points those tokens at the Links 592 palette.

## The idea

The refactor and the recolour are **separate**:

- **Stage A** — move to tokens whose values are *numerically identical* to what
  they replace. Provably a no-op; `color-signature.js --diff` must report zero
  changes.
- **Stage B** — flip the token values in `app/globals.css`. The whole visual
  change lands in one reviewable file.

A single diff that did both would be unreviewable — you couldn't tell an
intentional colour change from a codemod bug.

## Scripts

| script | purpose |
|---|---|
| `inventory.js` | Builds `inventory.json`: every distinct class string containing a palette class, with counts and locations. **The contract for the migration** — a human fills in `to` per row. |
| `codemod.js` | Applies the inventory (pass A, whole-string) and/or a token map (pass B, single class). |
| `verify-classes.js` | **Gate 1.** Proves no class silently produces zero CSS. |
| `color-signature.js` | **Gate 2.** Per-file colour signature; `--diff` proves a phase changed nothing. |
| `lib-scan.js` | Shared scanning primitives. |

## Running

```bash
node scripts/migration/inventory.js            # rebuild inventory.json
node scripts/migration/inventory.js --min 2    # skip the 354 singletons

node scripts/migration/color-signature.js > /tmp/sig-before.json
node scripts/migration/codemod.js --inventory --dry
node scripts/migration/codemod.js --inventory
node scripts/migration/color-signature.js > /tmp/sig-after.json
node scripts/migration/color-signature.js --diff /tmp/sig-before.json /tmp/sig-after.json

node scripts/migration/verify-classes.js
```

Run **both gates plus `npm run build && npm run type-check && npm run lint`**
every phase.

## Why text-level, not an AST

`jscodeshift`'s value here would be telling className strings from other
strings. But every palette-looking string in this repo *is* a class string —
there is no dynamic class construction (`bg-${x}`), no arbitrary values
(`bg-[#fff]`), and no palette word appears in prose. So the AST buys nothing and
costs a walk over `JSXAttribute` / `TemplateLiteral.quasis` / `ObjectExpression`
/ `ConditionalExpression` branches. Text-level is equally correct here and far
easier to review.

## Footguns

1. **Boundary assertions are mandatory.** `text-red-50` and `text-red-500` both
   exist here. A naive replace of the former corrupts the latter. `codemod.js`
   wraps every token in `(?<![\w-])…(?![\w-])` and sorts rules longest-first.

2. **Do not assume a fixed set of variant prefixes.** There are seven in use —
   `focus:` 251, `sm:` 204, `hover:` 195, `md:` 88, `disabled:` 74, `lg:` 37,
   `focus-visible:` 8 — and more may appear. Because `:` is a boundary
   character the assertions handle all of them for free; no special-casing.

3. **Never build class names by interpolation.** `` `bg-${tone}-soft` `` is
   invisible to Tailwind's content scanner and silently emits no CSS. Every tone
   map must be a literal lookup object. Gate 1 will not save you here — it scans
   source text, and the interpolated name never appears in it.

4. **`lib/` is not in the Tailwind `content` globs** as of this writing. A class
   string defined in a helper there produces no CSS until the glob is added.
   Phase 1 adds it.

5. **Regex over emitted CSS must put the escape branch first.** Tailwind writes
   `.focus\:ring-blue-500:focus`. With `[^:]` before `\\.` in the alternation,
   the greedy `+` matches `focus\`, succeeds, and never backtracks — silently
   truncating every variant class. Cost me a false "45 classes broken" report.

## Baseline

At the commit that introduced this tooling, on unmodified source:

- 3,219 palette-class hits · 710 distinct strings · 166 distinct classes · 48 files
- top 102 strings cover 1,293 occurrences (57%)
- gate 1: clean (after fixing a pre-existing `text-md` typo — not a Tailwind
  class — in two settings files)
- gate 2: 3,219 colour declarations resolved across 48 files
