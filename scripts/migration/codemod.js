#!/usr/bin/env node
/**
 * The migration codemod.
 *
 * Deliberately text-level, not jscodeshift. An AST buys you the ability to tell
 * className strings from other strings — but in this repo EVERY palette-looking
 * string is a class string (verified: zero dynamic class construction, zero
 * palette words in prose). So the AST costs a walk over JSXAttribute /
 * TemplateLiteral.quasis / ObjectExpression branches and buys nothing.
 *
 * Two passes:
 *   A — whole-string replacement, keyed on inventory.json rows that have a
 *       non-null `to`. This is how context-dependence is resolved: the card
 *       `bg-white` and the page-surface `bg-white` are different rows with
 *       different targets. A human decides once, per string.
 *   B — single-class replacement for residue, keyed on a token map.
 *
 * Usage:
 *   node scripts/migration/codemod.js --dry                 # report only
 *   node scripts/migration/codemod.js --map maps/gray.json  # apply pass B map
 *   node scripts/migration/codemod.js --inventory           # apply pass A
 *   node scripts/migration/codemod.js --only 'app/admin/trips/**'
 */
const fs = require('fs')
const path = require('path')
const { sourceFiles } = require('./lib-scan')

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f) => (argv.indexOf(f) >= 0 ? argv[argv.indexOf(f) + 1] : null)

const DRY = has('--dry')
const only = val('--only')

/** Escape a literal for use inside a RegExp. */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Build a boundary-safe matcher for a bare class token.
 *
 * The lookarounds are MANDATORY. `text-red-50` and `text-red-500` both exist in
 * this repo; without them a replace of the former corrupts the latter. `:` and
 * `/` are boundary characters, so variant prefixes (`hover:`, `focus:`, `md:`)
 * and opacity suffixes (`/40`) are handled for free — do not special-case them,
 * and do not assume a fixed set of prefixes.
 */
const tokenRe = (cls) => new RegExp(`(?<![\\w-])${esc(cls)}(?![\\w-])`, 'g')

// ---------------------------------------------------------------------------
// Load replacement rules
// ---------------------------------------------------------------------------
/** @type {Array<{from:string,to:string,count?:number}>} */
let stringRules = []
/** @type {Array<[string,string]>} */
let tokenRules = []

if (has('--inventory')) {
  const inv = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'inventory.json'), 'utf8')
  )
  stringRules = inv.rows.filter((r) => r.to && r.to !== r.from)
}

// Decisions kept outside inventory.json so they survive a regeneration
// (inventory.js resets every `to` to null).
const stringsArg = val('--strings')
if (stringsArg) {
  const m = JSON.parse(fs.readFileSync(stringsArg, 'utf8'))
  stringRules.push(
    ...Object.entries(m)
      .filter(([from, to]) => to && to !== from)
      .map(([from, to]) => ({ from, to }))
  )
}

// Longest first so a shorter string can never pre-empt a longer superset.
stringRules.sort((a, b) => b.from.length - a.from.length)

const mapArg = val('--map')
if (mapArg) {
  const m = JSON.parse(fs.readFileSync(mapArg, 'utf8'))
  tokenRules = Object.entries(m)
  // Longest first: `bg-gray-50` must not shadow `bg-gray-500`. Belt-and-braces
  // on top of the boundary assertions.
  tokenRules.sort((a, b) => b[0].length - a[0].length)
}

if (!stringRules.length && !tokenRules.length) {
  console.error(
    'nothing to do: pass --inventory, --strings <file.json> and/or --map <file.json>'
  )
  process.exit(2)
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------
const stats = { files: 0, stringHits: 0, tokenHits: 0, byRule: new Map() }

for (const file of sourceFiles()) {
  if (only && !file.includes(only.replace(/\*+/g, ''))) continue
  const src = fs.readFileSync(file, 'utf8')
  let next = src

  // Pass A — whole-string. Quote-aware so we only swap complete literals.
  for (const rule of stringRules) {
    for (const q of ['"', "'", '`']) {
      const needle = `${q}${rule.from}${q}`
      if (!next.includes(needle)) continue
      const n = next.split(needle).length - 1
      next = next.split(needle).join(`${q}${rule.to}${q}`)
      stats.stringHits += n
      stats.byRule.set(rule.from, (stats.byRule.get(rule.from) || 0) + n)
    }
  }

  // Pass B — residue, single class at a time.
  for (const [from, to] of tokenRules) {
    const re = tokenRe(from)
    const n = (next.match(re) || []).length
    if (!n) continue
    next = next.replace(re, to)
    stats.tokenHits += n
    stats.byRule.set(from, (stats.byRule.get(from) || 0) + n)
  }

  if (next !== src) {
    stats.files++
    if (!DRY) fs.writeFileSync(file, next)
  }
}

console.log(`${DRY ? '[dry run] ' : ''}files changed   ${stats.files}`)
console.log(`pass A (strings) ${stats.stringHits}`)
console.log(`pass B (tokens)  ${stats.tokenHits}`)
if (has('--verbose')) {
  console.log('\nper rule:')
  for (const [k, v] of [...stats.byRule].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`)
  }
}
