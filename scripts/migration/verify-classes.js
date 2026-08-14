#!/usr/bin/env node
/**
 * GATE 1 — catch classes that Tailwind silently drops.
 *
 * Tailwind fails soft: `bg-carrd` emits no CSS and no error, so a typo'd token
 * renders unstyled rather than breaking the build. Neither `next build`,
 * `tsc --noEmit` nor `next lint` catches it.
 *
 * This extracts every color-utility-shaped candidate from the source, compiles
 * Tailwind over the real content globs, and asserts each candidate produced a
 * selector. Works on source text, so it covers className attributes, ternaries,
 * template literals and bare object literals identically — which matters,
 * because the status maps live in object literals that eslint-plugin-tailwindcss
 * does not inspect.
 *
 *   node scripts/migration/verify-classes.js
 * Exit 1 if any candidate produced no CSS.
 */
const { execSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { sourceFiles, extractStringLiterals, candidateClassesIn } = require('./lib-scan')

// Utilities whose value is not a color and which we therefore must not police.
const NON_COLOR = /^(text-(xs|sm|base|lg|xl|\dxl|left|right|center|justify)|border-[0-9]|border-(solid|dashed|dotted|none|collapse|separate)|ring-[0-9]|shadow-(sm|md|lg|xl|2xl|none|inner)|from-\[|to-\[|via-\[|divide-[xy]|outline-(none|[0-9])|decoration-[0-9]|stroke-[0-9]|text-(ellipsis|clip|nowrap|wrap|balance)|bg-(none|cover|contain|center|no-repeat|repeat|fixed|local|scroll|clip|origin|gradient))/

const candidates = new Map() // class -> Set<file>

for (const file of sourceFiles()) {
  const src = fs.readFileSync(file, 'utf8')
  for (const { text } of extractStringLiterals(src)) {
    for (const cls of candidateClassesIn(text)) {
      if (NON_COLOR.test(cls.split(':').pop())) continue
      if (!candidates.has(cls)) candidates.set(cls, new Set())
      candidates.get(cls).add(file)
    }
  }
}

// Compile Tailwind over the real content globs and collect emitted selectors.
// Compile the real stylesheet so tokens defined in :root are in scope.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twverify-'))
const cssIn = 'app/globals.css'
const cssOut = path.join(tmp, 'out.css')

try {
  execSync(`npx tailwindcss -i ${cssIn} -o ${cssOut}`, { stdio: 'pipe' })
} catch (e) {
  console.error('tailwindcss build failed:\n' + (e.stderr || e.stdout || e).toString())
  process.exit(1)
}

const css = fs.readFileSync(cssOut, 'utf8')
/**
 * Tailwind escapes `:` `/` `.` `[` `]` in selectors — unescape to compare.
 * The escape alternative MUST come first: with the char class first, `focus\:`
 * matches as `focus\` and the greedy `+` succeeds without ever backtracking
 * into the escape branch, silently truncating every variant class.
 */
const emitted = new Set(
  [...css.matchAll(/\.((?:\\.|[^\s{},>+~:])+)/g)].map((m) => m[1].replace(/\\/g, ''))
)

const missing = []
for (const [cls, files] of candidates) {
  // A variant class emits as `.variant\:utility`; unescaped that is the class itself.
  if (!emitted.has(cls)) missing.push([cls, [...files]])
}

fs.rmSync(tmp, { recursive: true, force: true })

console.log(`candidates checked  ${candidates.size}`)
console.log(`emitted selectors   ${emitted.size}`)

if (missing.length) {
  console.error(`\n✗ ${missing.length} class(es) produce NO CSS — typo or undefined token:\n`)
  for (const [cls, files] of missing.sort()) {
    console.error(`  ${cls}`)
    for (const f of files.slice(0, 3)) console.error(`      ${f}`)
    if (files.length > 3) console.error(`      … +${files.length - 3} more`)
  }
  process.exit(1)
}
console.log('\n✓ every color-utility candidate resolves to real CSS')
