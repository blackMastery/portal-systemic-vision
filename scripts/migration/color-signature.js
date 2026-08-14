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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twsig-'))
const cssIn = path.join(tmp, 'in.css')
const cssOut = path.join(tmp, 'out.css')
fs.writeFileSync(cssIn, '@tailwind base;@tailwind components;@tailwind utilities;')
execSync(`npx tailwindcss -i ${cssIn} -o ${cssOut}`, { stdio: 'pipe' })
const css = fs.readFileSync(cssOut, 'utf8')
fs.rmSync(tmp, { recursive: true, force: true })

const COLOR_PROP = /^(color|background-color|border(-[a-z]+)?-color|fill|stroke|outline-color|caret-color|accent-color|text-decoration-color|--tw-ring-color|--tw-gradient-from|--tw-gradient-to|--tw-gradient-via|--tw-shadow-color|--tw-ring-offset-color)$/

/** class (unescaped) -> { prop: value } */
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
    declsFor.get(cls)[prop] = val
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
