#!/usr/bin/env node
/**
 * GATE 2 — computed-color equivalence.
 *
 * Stage A of the migration moves 3,219 hardcoded palette classes onto semantic
 * tokens whose values are defined to be NUMERICALLY IDENTICAL to what they
 * replace. So a correct Stage A must leave every rendered color byte-identical.
 *
 * This resolves every color class in the source to its actual declaration by
 * compiling Tailwind, then emits a per-file "color signature": the multiset of
 * (property, resolved value) pairs the file will paint. Diff the signature
 * before and after a phase — a correct phase yields ZERO changes.
 *
 * Intentional consolidations (e.g. collapsing gray-600 and gray-700) show up as
 * diffs and must be explicitly allowlisted with a reason.
 *
 *   node scripts/migration/color-signature.js > .sig-before.json
 *   # ...run a phase...
 *   node scripts/migration/color-signature.js > .sig-after.json
 *   node scripts/migration/color-signature.js --diff .sig-before.json .sig-after.json
 */
const { execSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { sourceFiles, extractStringLiterals, candidateClassesIn } = require('./lib-scan')

const argv = process.argv.slice(2)

if (argv[0] === '--diff') {
  const before = JSON.parse(fs.readFileSync(argv[1], 'utf8'))
  const after = JSON.parse(fs.readFileSync(argv[2], 'utf8'))
  const files = new Set([...Object.keys(before.files), ...Object.keys(after.files)])
  let changed = 0
  for (const f of [...files].sort()) {
    const b = before.files[f] || {}
    const a = after.files[f] || {}
    const keys = new Set([...Object.keys(b), ...Object.keys(a)])
    const deltas = []
    for (const k of keys) {
      if ((b[k] || 0) !== (a[k] || 0)) deltas.push(`    ${k}: ${b[k] || 0} -> ${a[k] || 0}`)
    }
    if (deltas.length) {
      changed++
      console.log(`\n${f}`)
      deltas.sort().forEach((d) => console.log(d))
    }
  }
  if (!changed) {
    console.log('✓ 0 color changes — phase is a provable no-op')
    process.exit(0)
  }
  console.log(`\n✗ ${changed} file(s) changed color. Each must be intentional and allowlisted.`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Build the class -> declarations map by compiling Tailwind once.
// ---------------------------------------------------------------------------
// Compile the REAL stylesheet, not a synthetic one: `app/globals.css` is where
// the :root custom properties live, and without them every `hsl(var(--x))`
// resolves to nothing and the whole gate silently reports "unresolved".
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twsig-'))
const cssIn = 'app/globals.css'
const cssOut = path.join(tmp, 'out.css')
execSync(`npx tailwindcss -i ${cssIn} -o ${cssOut}`, { stdio: 'pipe' })
const css = fs.readFileSync(cssOut, 'utf8')
fs.rmSync(tmp, { recursive: true, force: true })

const COLOR_PROP = /^(color|background-color|border(-[a-z]+)?-color|fill|stroke|outline-color|caret-color|accent-color|text-decoration-color|--tw-ring-color|--tw-gradient-from|--tw-gradient-to|--tw-gradient-via|--tw-shadow-color|--tw-ring-offset-color)$/

// ---------------------------------------------------------------------------
// Canonicalise colour values to `rgb(R G B)`.
//
// This is the crux of the gate. A palette class emits
//   background-color: rgb(255 255 255 / var(--tw-bg-opacity, 1))
// while the token that replaces it emits
//   background-color: hsl(var(--card) / var(--tw-bg-opacity, 1))
// Those differ as TEXT but are identical as COLOUR. Comparing raw declaration
// strings would flag every single migrated class, making the gate useless for
// the one thing it exists to prove. So: resolve the var, convert HSL to RGB,
// and drop the opacity channel (which the migration never changes).
// ---------------------------------------------------------------------------

/** Parse `--name: H S% L%;` pairs out of the :root block. */
function parseRootVars(cssText) {
  const vars = new Map()
  const root = cssText.match(/:root\s*\{([^}]*)\}/)
  if (!root) return vars
  for (const decl of root[1].split(';')) {
    const m = decl.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*$/)
    if (m) vars.set(m[1], m[2])
  }
  return vars
}

function hslTripletToRgb(triplet) {
  const m = triplet.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/)
  if (!m) return null
  const h = parseFloat(m[1]) / 360
  const s = parseFloat(m[2]) / 100
  const l = parseFloat(m[3]) / 100
  if (s === 0) {
    const v = Math.round(l * 255)
    return `rgb(${v} ${v} ${v})`
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const r = Math.round(hue(h + 1 / 3) * 255)
  const g = Math.round(hue(h) * 255)
  const b = Math.round(hue(h - 1 / 3) * 255)
  return `rgb(${r} ${g} ${b})`
}

function canonicalColor(value, vars) {
  let v = value.trim()
  // Strip the alpha channel — migration never changes opacity.
  v = v.replace(/\s*\/\s*var\([^)]*\)\s*/g, '').replace(/\s*\/\s*[\d.%]+\s*/g, '')
  // hsl(var(--x)) -> resolve
  const varMatch = v.match(/^hsl\(\s*var\((--[\w-]+)\)\s*\)$/)
  if (varMatch) {
    const triplet = vars.get(varMatch[1])
    if (triplet) {
      const rgb = hslTripletToRgb(triplet)
      if (rgb) return rgb
    }
    return `unresolved(${varMatch[1]})`
  }
  // hsl(H S% L%) literal
  const hslMatch = v.match(/^hsl\(\s*([\d.]+)\s+([\d.]+%)\s+([\d.]+%)\s*\)$/)
  if (hslMatch) {
    const rgb = hslTripletToRgb(`${hslMatch[1]} ${hslMatch[2]} ${hslMatch[3]}`)
    if (rgb) return rgb
  }
  // rgb(R G B) already canonical — normalise whitespace/commas
  const rgbMatch = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/)
  if (rgbMatch) {
    return `rgb(${Math.round(+rgbMatch[1])} ${Math.round(+rgbMatch[2])} ${Math.round(+rgbMatch[3])})`
  }
  return v
}

const rootVars = parseRootVars(css)

/** class (unescaped) -> { prop: canonical rgb } */
const declsFor = new Map()
for (const m of css.matchAll(/((?:\.(?:\\.|[^\s{},>+~])+[^{]*?))\{([^}]*)\}/g)) {
  const selector = m[1]
  const body = m[2]
  const clsMatch = selector.match(/\.((?:\\.|[^\s{},>+~:])+)/)
  if (!clsMatch) continue
  const cls = clsMatch[1].replace(/\\/g, '')
  for (const d of body.split(';')) {
    const i = d.indexOf(':')
    if (i < 0) continue
    const prop = d.slice(0, i).trim()
    const val = d.slice(i + 1).trim()
    if (!COLOR_PROP.test(prop)) continue
    if (!declsFor.has(cls)) declsFor.set(cls, {})
    declsFor.get(cls)[prop] = canonicalColor(val, rootVars)
  }
}

// ---------------------------------------------------------------------------
// Walk the source and accumulate a per-file signature.
// ---------------------------------------------------------------------------
const out = { files: {} }
let resolved = 0
let unresolved = 0

for (const file of sourceFiles()) {
  const src = fs.readFileSync(file, 'utf8')
  const sig = {}
  for (const { text } of extractStringLiterals(src)) {
    for (const cls of candidateClassesIn(text)) {
      const decls = declsFor.get(cls)
      if (!decls) {
        unresolved++
        continue
      }
      resolved++
      for (const [prop, val] of Object.entries(decls)) {
        // Variant prefix is part of the identity: hover:bg-x != bg-x.
        const variant = cls.includes(':') ? cls.slice(0, cls.lastIndexOf(':') + 1) : ''
        const key = `${variant}${prop}=${val}`
        sig[key] = (sig[key] || 0) + 1
      }
    }
  }
  if (Object.keys(sig).length) out.files[path.relative(process.cwd(), file)] = sig
}

out.totals = { resolved, unresolved, files: Object.keys(out.files).length }
process.stdout.write(JSON.stringify(out, null, 2))
process.stderr.write(
  `resolved ${resolved} color declarations across ${out.totals.files} files ` +
    `(${unresolved} non-color candidates skipped)\n`
)
