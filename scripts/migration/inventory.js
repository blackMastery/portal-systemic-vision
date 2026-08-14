#!/usr/bin/env node
/**
 * Phase 0 — build the migration inventory.
 *
 * Emits scripts/migration/inventory.json: every DISTINCT string literal that
 * contains at least one hardcoded palette class, with its occurrence count and
 * the files it appears in.
 *
 * This file is the contract for the whole migration. A human fills in `to` for
 * each row; the codemod applies them. Rows are ordered by occurrence count so
 * the highest-leverage decisions come first.
 *
 *   node scripts/migration/inventory.js
 *   node scripts/migration/inventory.js --min 2   # skip singletons
 */
const fs = require('fs')
const path = require('path')
const {
  sourceFiles,
  extractStringLiterals,
  paletteClassesIn,
} = require('./lib-scan')

const argv = process.argv.slice(2)
const minCount = Number(argv[argv.indexOf('--min') + 1]) || 1

const { FAMILIES } = require('./lib-scan')
const FAM_SET = new Set([...FAMILIES, 'white', 'black', 'transparent', 'current', 'inherit'])

/** Family of a palette class, ignoring variant prefixes and opacity suffix. */
function familyOf(cls) {
  const bare = cls.split(':').pop().replace(/\/\d+$/, '')
  const parts = bare.split('-')
  for (let i = parts.length - 1; i >= 0; i--) {
    if (FAM_SET.has(parts[i])) return parts[i]
  }
  return 'other'
}

const strings = new Map() // text -> { count, files:Map<file,count>, classes:Set }
const classHits = new Map() // palette class -> count
const fileHits = new Map() // file -> hit count

for (const file of sourceFiles()) {
  const src = fs.readFileSync(file, 'utf8')
  for (const { text } of extractStringLiterals(src)) {
    const classes = paletteClassesIn(text)
    if (!classes.length) continue

    const rec =
      strings.get(text) ||
      { count: 0, files: new Map(), classes: new Set() }
    rec.count += 1
    rec.files.set(file, (rec.files.get(file) || 0) + 1)
    classes.forEach((c) => rec.classes.add(c))
    strings.set(text, rec)

    for (const c of classes) classHits.set(c, (classHits.get(c) || 0) + 1)
    fileHits.set(file, (fileHits.get(file) || 0) + classes.length)
  }
}

const rows = [...strings.entries()]
  .filter(([, r]) => r.count >= minCount)
  .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
  .map(([text, r]) => ({
    from: text,
    to: null, // <- filled in by a human, then consumed by codemod.js
    count: r.count,
    classes: [...r.classes].sort(),
    files: [...r.files.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([f, n]) => `${f}${n > 1 ? ` (${n})` : ''}`),
  }))

const totalHits = [...classHits.values()].reduce((a, b) => a + b, 0)
const out = {
  generatedFrom: 'scripts/migration/inventory.js',
  totals: {
    paletteClassHits: totalHits,
    distinctStrings: strings.size,
    distinctPaletteClasses: classHits.size,
    filesTouched: fileHits.size,
    stringsAtOrAboveMin: rows.length,
  },
  byFamily: Object.fromEntries(
    [...classHits.entries()]
      .reduce((acc, [cls, n]) => {
        acc.set(familyOf(cls), (acc.get(familyOf(cls)) || 0) + n)
        return acc
      }, new Map())
      .entries()
  ),
  topClasses: [...classHits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40),
  topFiles: [...fileHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
  rows,
}

const dest = path.join(__dirname, 'inventory.json')
fs.writeFileSync(dest, JSON.stringify(out, null, 2))

console.log(`palette class hits      ${out.totals.paletteClassHits}`)
console.log(`distinct class strings  ${out.totals.distinctStrings}`)
console.log(`distinct palette classes ${out.totals.distinctPaletteClasses}`)
console.log(`files touched           ${out.totals.filesTouched}`)
console.log(`rows written (min ${minCount})     ${rows.length}`)
const cum = rows.slice(0, 102).reduce((a, r) => a + r.count, 0)
console.log(`top 102 strings cover    ${cum} occurrences`)
console.log(`\nwrote ${path.relative(process.cwd(), dest)}`)
