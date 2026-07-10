#!/usr/bin/env node
/**
 * release-web.mjs — Bump the web-facing version and regenerate the in-app
 * "What's new" changelog (apps/web/src/data/changelog.json).
 *
 * Web deploys continuously on every push to main (see build-app.yml) — there
 * is no discrete "release" to cut. This script does NOT gate or trigger any
 * deploy; it exists purely to snapshot a changelog entry for the WhatsNew
 * widget, on whatever cadence you choose to run it.
 *
 * Tags use the web-v* prefix (not v*) so they can never be mistaken for — or
 * accidentally match — a deploy-triggering tag pattern.
 *
 * Usage:
 *   node scripts/release-web.mjs patch    # 1.1.0 → 1.1.1
 *   node scripts/release-web.mjs minor    # 1.1.0 → 1.2.0
 *   node scripts/release-web.mjs major    # 1.1.0 → 2.0.0
 *   node scripts/release-web.mjs 1.2.0    # explicit version
 *
 * Does NOT push.
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const PKG_PATHS = [resolve(ROOT, 'package.json'), resolve(ROOT, 'apps/web/package.json')]

function run(cmd) {
  console.log(`  $ ${cmd}`)
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: 'inherit' })
}

function readVersion() {
  return JSON.parse(readFileSync(PKG_PATHS[0], 'utf-8')).version
}

function bumpVersion(current, input) {
  const [major, minor, patch] = current.split('.').map(Number)
  switch (input) {
    case 'patch': return `${major}.${minor}.${patch + 1}`
    case 'minor': return `${major}.${minor + 1}.0`
    case 'major': return `${major + 1}.0.0`
    default:
      if (/^\d+\.\d+\.\d+$/.test(input)) return input
      console.error(`Invalid version input: ${input}`)
      console.error('Usage: node scripts/release-web.mjs [patch|minor|major|X.Y.Z]')
      process.exit(1)
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const input = process.argv[2]
if (!input) {
  console.error('Usage: node scripts/release-web.mjs [patch|minor|major|X.Y.Z]')
  process.exit(1)
}

const oldVersion = readVersion()
const newVersion = bumpVersion(oldVersion, input)

console.log(`\nVersion: ${oldVersion} → ${newVersion}\n`)

for (const pkgPath of PKG_PATHS) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  pkg.version = newVersion
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
}

console.log('Generating changelog...')
run('node scripts/generate-changelog.mjs')

console.log('\nCommitting...')
run('git add package.json apps/web/package.json apps/web/src/data/changelog.json')
run(`git commit -m "chore(release): web v${newVersion}"`)
run(`git tag web-v${newVersion}`)

console.log(`\nDone! Tagged web-v${newVersion} locally.`)
console.log('  git push && git push origin web-v' + newVersion + '   # when ready')
