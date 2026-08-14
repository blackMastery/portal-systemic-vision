#!/usr/bin/env node
/**
 * `text-white` on a brand fill must become `text-primary-foreground`.
 *
 * This is the single most consequential mapping in the whole migration. Once
 * Stage B lands, `bg-primary` is #FFA240 — white on it is 2.00:1, which fails
 * WCAG AA even for large text. Ink on it is 8.05:1. Getting this wrong ships
 * unreadable primary buttons across the entire portal, which is exactly the
 * bug we declined to copy from the rider app.
 *
 * Context-sensitive by necessity: `text-white` is correct on `bg-danger`,
 * `bg-success` and `bg-violet` and must be left alone there. So the rule is
 * scoped to strings that also carry a BARE `bg-primary` — not `bg-primary-soft`
 * (a pale tint that takes dark text) and not `bg-primary-hover`.
 *
 *   node scripts/migration/fix-on-primary.js --dry
 *   node scripts/migration/fix-on-primary.js
 */
const fs = require('fs')
const { sourceFiles, extractStringLiterals } = require('./lib-scan')

const DRY = process.argv.includes('--dry')

/** Bare `bg-primary`, never the -soft / -hover / -strong variants. */
const BARE_BG_PRIMARY = /(?<![\w-])bg-primary(?![\w-])/
const TEXT_WHITE = /(?<![\w-])text-white(?![\w-])/g

let files = 0
let hits = 0
const touched = []

for (const file of sourceFiles()) {
  const src = fs.readFileSync(file, 'utf8')
  let next = src

  for (const { text } of extractStringLiterals(src)) {
    if (!BARE_BG_PRIMARY.test(text)) continue
    if (!TEXT_WHITE.test(text)) continue
    TEXT_WHITE.lastIndex = 0
    const replaced = text.replace(TEXT_WHITE, 'text-primary-foreground')
    if (replaced === text) continue
    // Swap the whole literal so we never touch an unrelated `text-white`.
    const n = next.split(text).length - 1
    if (!n) continue
    next = next.split(text).join(replaced)
    hits += n
  }

  if (next !== src) {
    files++
    touched.push(file)
    if (!DRY) fs.writeFileSync(file, next)
  }
}

console.log(`${DRY ? '[dry run] ' : ''}files ${files}   text-white -> text-primary-foreground: ${hits}`)
touched.forEach((f) => console.log(`  ${f}`))
