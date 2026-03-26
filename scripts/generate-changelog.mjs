#!/usr/bin/env node
/**
 * generate-changelog.mjs
 *
 * Parses git history (conventional commits) between version tags and outputs
 * a structured JSON changelog that the frontend can consume.
 *
 * Usage:
 *   node scripts/generate-changelog.mjs          # full regeneration
 *   node scripts/generate-changelog.mjs --latest  # only the latest version
 *
 * Expects version tags like v1.0.0, v1.1.0, etc.
 * If no tags exist, groups all commits under the current package.json version.
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUTPUT = resolve(ROOT, 'src/data/changelog.json')

// ── Helpers ──────────────────────────────────────────────────────────────────

function git(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim()
}

function getPackageVersion() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'))
  return pkg.version
}

/** Returns sorted tags (newest first) matching vX.Y.Z */
function getTags() {
  try {
    const raw = git('git tag -l "v*" --sort=-v:refname')
    return raw ? raw.split('\n').filter(Boolean) : []
  } catch {
    return []
  }
}

/** Returns commits between two refs (or all if no from). */
function getCommits(from, to = 'HEAD') {
  const range = from ? `${from}..${to}` : to
  const SEP = '---COMMIT---'
  const FORMAT = `${SEP}%n%H%n%s%n%b%n%aI`
  try {
    const raw = git(`git log ${range} --format="${FORMAT}" --no-merges`)
    if (!raw) return []
    return raw
      .split(SEP)
      .filter(Boolean)
      .map(block => {
        const lines = block.trim().split('\n')
        const [hash, subject, ...bodyLines] = lines
        const date = bodyLines.pop() // last line is the ISO date
        return { hash, subject, body: bodyLines.join('\n').trim(), date }
      })
  } catch {
    return []
  }
}

// ── Conventional commit parser ───────────────────────────────────────────────

const TYPE_MAP = {
  feat:     { label: 'Nuevas funciones',   emoji: '✨', order: 0 },
  fix:      { label: 'Correcciones',       emoji: '🐛', order: 1 },
  perf:     { label: 'Rendimiento',        emoji: '⚡', order: 2 },
  refactor: { label: 'Mejoras internas',   emoji: '♻️', order: 3 },
  style:    { label: 'Estilos',            emoji: '🎨', order: 4 },
  docs:     { label: 'Documentación',      emoji: '📝', order: 5 },
  chore:    { label: 'Mantenimiento',      emoji: '🔧', order: 6 },
  test:     { label: 'Tests',              emoji: '🧪', order: 7 },
  ci:       { label: 'CI/CD',              emoji: '🏗️', order: 8 },
  build:    { label: 'Build',              emoji: '📦', order: 9 },
}

const COMMIT_RE = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/

function parseCommit(raw) {
  const match = raw.subject.match(COMMIT_RE)
  if (!match) {
    return { type: 'other', scope: null, breaking: false, description: raw.subject, hash: raw.hash, date: raw.date }
  }
  const [, type, scope, bang, description] = match
  const breaking = !!bang || /BREAKING[ -]CHANGE/i.test(raw.body)
  return {
    type: type.toLowerCase(),
    scope: scope || null,
    breaking,
    description: description.charAt(0).toUpperCase() + description.slice(1),
    hash: raw.hash.slice(0, 7),
    date: raw.date,
  }
}

function groupByType(commits) {
  const groups = {}
  for (const c of commits) {
    // Skip types we don't want in the user-facing changelog
    if (['test', 'ci', 'build', 'docs'].includes(c.type) && !c.breaking) continue

    const key = c.type
    const meta = TYPE_MAP[key] || { label: 'Otros', emoji: '📌', order: 99 }
    if (!groups[key]) groups[key] = { ...meta, type: key, items: [] }
    groups[key].items.push({
      description: c.description,
      scope: c.scope,
      breaking: c.breaking,
      hash: c.hash,
    })
  }
  return Object.values(groups).sort((a, b) => a.order - b.order)
}

// ── Main ─────────────────────────────────────────────────────────────────────

function generateChangelog() {
  const tags = getTags()
  const pkgVersion = getPackageVersion()
  const versions = []

  if (tags.length === 0) {
    // No tags yet — group everything under current package.json version
    const commits = getCommits(null, 'HEAD')
    const parsed = commits.map(parseCommit)
    const date = parsed[0]?.date?.split('T')[0] || new Date().toISOString().split('T')[0]
    versions.push({
      version: pkgVersion,
      date,
      groups: groupByType(parsed),
    })
  } else {
    // Unreleased commits (HEAD..latest tag)
    const unreleasedCommits = getCommits(tags[0], 'HEAD')
    if (unreleasedCommits.length > 0) {
      const parsed = unreleasedCommits.map(parseCommit)
      const date = parsed[0]?.date?.split('T')[0] || new Date().toISOString().split('T')[0]
      versions.push({
        version: pkgVersion,
        date,
        groups: groupByType(parsed),
      })
    }

    // Tagged versions
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i]
      const prevTag = tags[i + 1] || null
      const commits = getCommits(prevTag, tag)
      if (commits.length === 0) continue

      const parsed = commits.map(parseCommit)
      let tagDate
      try {
        tagDate = git(`git log -1 --format=%aI ${tag}`).split('T')[0]
      } catch {
        tagDate = parsed[0]?.date?.split('T')[0] || ''
      }

      versions.push({
        version: tag.replace(/^v/, ''),
        date: tagDate,
        groups: groupByType(parsed),
      })
    }
  }

  const changelog = {
    generated: new Date().toISOString(),
    versions,
  }

  writeFileSync(OUTPUT, JSON.stringify(changelog, null, 2), 'utf-8')
  console.log(`Changelog generated → ${OUTPUT}`)
  console.log(`  ${versions.length} version(s), ${versions.reduce((n, v) => n + v.groups.reduce((m, g) => m + g.items.length, 0), 0)} entries`)
}

generateChangelog()
