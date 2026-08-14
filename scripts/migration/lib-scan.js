/**
 * Shared scanning primitives for the design-token migration.
 *
 * Everything here works on raw source text rather than an AST. That is safe in
 * this repo specifically because every palette-looking string is a className
 * string — there is no dynamic class construction and no palette word appears
 * in prose. See scripts/migration/README.md.
 */
const fs = require('fs')
const path = require('path')

const ROOTS = ['app', 'components', 'lib', 'hooks']
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx'])

/** Tailwind color families we expect to find hardcoded. */
const FAMILIES = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
]

/**
 * Utility prefixes that take a color. MUST be longest-first: the regex
 * alternates in order, so a bare `ring` would otherwise shadow `ring-offset`
 * and turn `ring-offset-2` (a width) into a bogus color candidate.
 */
const UTILS = [
  'ring-offset', 'placeholder', 'decoration', 'divide', 'stroke', 'shadow',
  'accent', 'border', 'outline', 'caret', 'text', 'fill', 'from', 'ring',
  'via', 'bg', 'to',
]

/**
 * Matches a hardcoded palette class, with optional variant prefixes and an
 * optional /opacity suffix. Variant prefixes are matched generically — do NOT
 * hardcode the set, this repo has seven and more may appear.
 */
const PALETTE_CLASS = new RegExp(
  String.raw`(?<![\w-])` +
    String.raw`((?:[a-z-]+(?:\[[^\]]*\])?:)*)` + // variant prefixes
    `(${UTILS.join('|')})-` +
    `(?:(${FAMILIES.join('|')})-(\\d{1,3})|(white|black|transparent|current|inherit))` +
    String.raw`(\/\d{1,3})?` + // opacity modifier
    String.raw`(?![\w-])`,
  'g'
)

/** Any color-ish utility candidate, incl. token classes. Used by the gate. */
const CANDIDATE_CLASS = new RegExp(
  String.raw`(?<![\w-])` +
    String.raw`((?:[a-z-]+(?:\[[^\]]*\])?:)*)` +
    `(${UTILS.join('|')})-` +
    String.raw`([a-z][\w-]*)` +
    String.raw`(\/\d{1,3})?` +
    String.raw`(?![\w-])`,
  'g'
)

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (EXTS.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

function sourceFiles(roots = ROOTS) {
  return roots.flatMap((r) => walk(r))
}

/**
 * Extract every string-literal body from a source file: single-quoted,
 * double-quoted, and each static chunk (quasi) of a template literal.
 * Returns [{ text, line }].
 */
function extractStringLiterals(src) {
  const out = []
  // Single/double quoted, no escapes-with-newlines to worry about in JSX classes.
  const quoted = /(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g
  let m
  while ((m = quoted.exec(src))) {
    out.push({ text: m[2], index: m.index })
  }
  // Template literal quasis: grab backtick spans, then split on ${...}.
  const tmpl = /`((?:\\.|[^\\`])*)`/gs
  while ((m = tmpl.exec(src))) {
    const body = m[1]
    let offset = m.index + 1
    for (const chunk of body.split(/\$\{[^}]*\}/g)) {
      if (chunk.trim()) out.push({ text: chunk, index: offset })
      offset += chunk.length
    }
  }
  return out.map((s) => ({
    text: s.text,
    line: src.slice(0, s.index).split('\n').length,
  }))
}

function paletteClassesIn(text) {
  const found = []
  let m
  PALETTE_CLASS.lastIndex = 0
  while ((m = PALETTE_CLASS.exec(text))) found.push(m[0])
  return found
}

function candidateClassesIn(text) {
  const found = []
  let m
  CANDIDATE_CLASS.lastIndex = 0
  while ((m = CANDIDATE_CLASS.exec(text))) found.push(m[0])
  return found
}

module.exports = {
  ROOTS,
  FAMILIES,
  UTILS,
  PALETTE_CLASS,
  CANDIDATE_CLASS,
  sourceFiles,
  extractStringLiterals,
  paletteClassesIn,
  candidateClassesIn,
}
