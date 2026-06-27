#!/usr/bin/env node
/**
 * sync-exercise-media.mjs
 *
 * Copies every file under seeds/exercises/media/<slug>/ into
 * apps/web/public/exercise-media/<slug>/ so the web app can serve them
 * at origin-relative paths like /exercise-media/<slug>/<filename>.
 *
 * Rules:
 *   - Only processes direct sub-directories of seeds/exercises/media/ (slugs).
 *   - Skips top-level non-directory entries (e.g. README.md).
 *   - Skips any entry whose name starts with "_" (internal/draft).
 *   - Idempotent: copies only when source mtime > dest mtime or dest absent.
 *
 * Usage:
 *   node scripts/sync-exercise-media.mjs
 */

import {
  readdirSync,
  statSync,
  mkdirSync,
  copyFileSync,
  existsSync,
} from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const SRC_DIR = join(ROOT, 'seeds/exercises/media')
const DST_DIR = join(ROOT, 'apps/web/public/exercise-media')

let copied = 0
let skipped = 0

// Ensure the destination root exists
mkdirSync(DST_DIR, { recursive: true })

const entries = readdirSync(SRC_DIR, { withFileTypes: true })

for (const entry of entries) {
  // Skip non-directories (README.md, etc.) and _-prefixed names
  if (!entry.isDirectory()) continue
  if (entry.name.startsWith('_')) continue

  const slug = entry.name
  const srcSlug = join(SRC_DIR, slug)
  const dstSlug = join(DST_DIR, slug)

  mkdirSync(dstSlug, { recursive: true })

  const files = readdirSync(srcSlug, { withFileTypes: true })
  for (const file of files) {
    if (!file.isFile()) continue

    const srcFile = join(srcSlug, file.name)
    const dstFile = join(dstSlug, file.name)

    // Idempotent: skip if dst exists and is at least as new as src
    if (existsSync(dstFile)) {
      const srcMtime = statSync(srcFile).mtimeMs
      const dstMtime = statSync(dstFile).mtimeMs
      if (dstMtime >= srcMtime) {
        skipped++
        continue
      }
    }

    copyFileSync(srcFile, dstFile)
    console.log(`  synced: exercise-media/${slug}/${file.name}`)
    copied++
  }
}

console.log(`\nSync complete: ${copied} copied, ${skipped} already up-to-date`)
