#!/usr/bin/env node
/**
 * release.mjs — Bump version, regenerate changelog, commit & tag.
 *
 * Usage:
 *   node scripts/release.mjs patch    # 1.0.0 → 1.0.1
 *   node scripts/release.mjs minor    # 1.0.0 → 1.1.0
 *   node scripts/release.mjs major    # 1.0.0 → 2.0.0
 *   node scripts/release.mjs 2.3.1    # explicit version
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const PKG_PATH = resolve(ROOT, 'package.json')

function run(cmd) {
  console.log(`  $ ${cmd}`)
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: 'inherit' })
}

function readVersion() {
  return JSON.parse(readFileSync(PKG_PATH, 'utf-8')).version
}

function bumpVersion(input) {
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8'))
  const [major, minor, patch] = pkg.version.split('.').map(Number)

  switch (input) {
    case 'patch': pkg.version = `${major}.${minor}.${patch + 1}`; break
    case 'minor': pkg.version = `${major}.${minor + 1}.0`; break
    case 'major': pkg.version = `${major + 1}.0.0`; break
    default:
      if (/^\d+\.\d+\.\d+$/.test(input)) {
        pkg.version = input
      } else {
        console.error(`Invalid version input: ${input}`)
        console.error('Usage: node scripts/release.mjs [patch|minor|major|X.Y.Z]')
        process.exit(1)
      }
  }

  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
  return pkg.version
}

// ── Main ─────────────────────────────────────────────────────────────────────

const input = process.argv[2]
if (!input) {
  console.error('Usage: node scripts/release.mjs [patch|minor|major|X.Y.Z]')
  process.exit(1)
}

const oldVersion = readVersion()
const newVersion = bumpVersion(input)

console.log(`\nVersion: ${oldVersion} → ${newVersion}\n`)

// Regenerate changelog with the new version
console.log('Generating changelog...')
run('node scripts/generate-changelog.mjs')

// Stage, commit, tag
console.log('\nCommitting...')
run('git add package.json src/data/changelog.json')
run(`git commit -m "release: v${newVersion}"`)
run(`git tag v${newVersion}`)

// Re-generate so the tag is now included properly
console.log('\nRe-generating changelog with tag...')
run('node scripts/generate-changelog.mjs')
run('git add src/data/changelog.json')
run(`git commit --amend --no-edit`)

console.log(`\nDone! Released v${newVersion}`)
console.log(`  git push && git push --tags   # when ready`)
