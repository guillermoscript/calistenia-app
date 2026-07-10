#!/usr/bin/env node
/**
 * release-mobile.mjs — Bump the native app version, generate the AI changelog
 * entry + root CHANGELOG.md/.es.md, commit and tag mobile-vX.Y.Z.
 *
 * Mirrors release-web.mjs but targets apps/mobile/app.json (the source of
 * truth for the native version/versionCode — NOT apps/mobile/package.json)
 * and the mobile-v* tag convention build-mobile-apk.yml listens on.
 *
 * Usage:
 *   node scripts/release-mobile.mjs patch    # 1.1.1 → 1.1.2
 *   node scripts/release-mobile.mjs minor    # 1.1.1 → 1.2.0
 *   node scripts/release-mobile.mjs major    # 1.1.1 → 2.0.0
 *   node scripts/release-mobile.mjs 1.3.0    # explicit version
 *
 * Does NOT push. Pushing the mobile-v* tag triggers a real APK build +
 * GitHub release, so that step stays a deliberate, separate action:
 *   git push && git push origin mobile-vX.Y.Z
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const APP_JSON_PATH = resolve(ROOT, 'apps/mobile/app.json')

function run(cmd) {
  console.log(`  $ ${cmd}`)
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: 'inherit' })
}

function git(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim()
}

function readAppJson() {
  return JSON.parse(readFileSync(APP_JSON_PATH, 'utf-8'))
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
      console.error('Usage: node scripts/release-mobile.mjs [patch|minor|major|X.Y.Z]')
      process.exit(1)
  }
}

/** Latest released mobile tag (mobile-v1.2.3), ignoring prereleases. */
function lastMobileTag() {
  try {
    const raw = git('git tag -l "mobile-v*" --sort=-v:refname')
    const tags = raw ? raw.split('\n').filter(Boolean) : []
    return tags.find((t) => /^mobile-v\d+\.\d+\.\d+$/.test(t)) || null
  } catch {
    return null
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const input = process.argv[2]
if (!input) {
  console.error('Usage: node scripts/release-mobile.mjs [patch|minor|major|X.Y.Z]')
  process.exit(1)
}

const appJson = readAppJson()
const oldVersion = appJson.expo.version
const newVersion = bumpVersion(oldVersion, input)
const oldVersionCode = appJson.expo.android.versionCode
const newVersionCode = oldVersionCode + 1

console.log(`\nVersion:     ${oldVersion} → ${newVersion}`)
console.log(`VersionCode: ${oldVersionCode} → ${newVersionCode}\n`)

appJson.expo.version = newVersion
appJson.expo.android.versionCode = newVersionCode
writeFileSync(APP_JSON_PATH, JSON.stringify(appJson, null, 2) + '\n', 'utf-8')

const baseTag = lastMobileTag()
console.log(`Base tag: ${baseTag || '(none — first mobile release)'}`)

console.log('\nGenerating AI changelog entry...')
run(
  `node scripts/generate-changelog-ai.mjs ${newVersion}${baseTag ? ` ${baseTag}` : ''}`,
)

console.log('\nRendering CHANGELOG.md / CHANGELOG.es.md...')
run('node scripts/generate-changelog-md.mjs')

console.log('\nCommitting...')
run(
  'git add apps/mobile/app.json packages/core/data/changelog.mobile.json CHANGELOG.md CHANGELOG.es.md',
)
run(`git commit -m "chore(release): mobile v${newVersion}"`)
run(`git tag mobile-v${newVersion}`)

console.log(`\nDone! Tagged mobile-v${newVersion} locally.`)
console.log('  git push && git push origin mobile-v' + newVersion + '   # when ready (triggers the APK build)')
