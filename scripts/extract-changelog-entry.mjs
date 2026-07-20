#!/usr/bin/env node
/**
 * extract-changelog-entry.mjs — Print one version's curated bilingual
 * changelog entry (from packages/core/data/changelog.mobile.json) as
 * release-note markdown.
 *
 * Used by build-mobile-apk.yml so the GitHub Release body for a tag-push
 * release shows the same summary/highlights written by
 * `pnpm release:mobile`, instead of a generic "Automated build" fallback.
 *
 * Usage:
 *   node scripts/extract-changelog-entry.mjs 1.6.0
 *
 * Exits 1 (no output) if the version has no entry — callers should fall
 * back to their own default text in that case.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SOURCE = resolve(ROOT, 'packages/core/data/changelog.mobile.json')

const version = process.argv[2]
if (!version) {
  console.error('Usage: node scripts/extract-changelog-entry.mjs <version>')
  process.exit(1)
}

const data = JSON.parse(readFileSync(SOURCE, 'utf-8'))
const entry = data.versions.find((v) => v.version === version)
if (!entry) {
  console.error(`No changelog entry for version ${version}`)
  process.exit(1)
}

const lines = [`_${entry.summary.es}_`, '']
for (const h of entry.highlights) {
  lines.push(`${h.icon} **${h.title.es}** — ${h.body.es}`)
}
console.log(lines.join('\n'))
