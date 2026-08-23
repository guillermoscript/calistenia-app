#!/usr/bin/env node
/**
 * extract-changelog-entry.mjs — Saca UNA versión de changelog.mobile.json en el
 * formato que pida quien la consume.
 *
 *   node scripts/extract-changelog-entry.mjs 1.11.0                 # markdown es (GitHub Release)
 *   node scripts/extract-changelog-entry.mjs 1.11.0 --lang en       # markdown en
 *   node scripts/extract-changelog-entry.mjs 1.11.0 --format play   # texto plano <=500 chars (Play)
 *
 * Importable: entryFor(version), toMarkdown(entry, lang), toPlayNotes(entry, lang).
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHANGELOG = resolve(ROOT, 'packages/core/data/changelog.mobile.json')

/** Play corta las notas de versión a 500 caracteres por idioma. */
export const PLAY_NOTES_MAX = 500

export function loadChangelog() {
  return JSON.parse(readFileSync(CHANGELOG, 'utf-8'))
}

export function entryFor(version) {
  const { versions } = loadChangelog()
  const wanted = String(version).replace(/^(mobile-)?v/, '')
  const entry = versions.find((v) => v.version === wanted)
  if (!entry) {
    throw new Error(
      `No hay entrada de changelog para ${wanted}. Versiones: ${versions.slice(0, 5).map((v) => v.version).join(', ')}…`,
    )
  }
  return entry
}

const pick = (field, lang) => (typeof field === 'string' ? field : field?.[lang] ?? field?.es ?? '')

export function toMarkdown(entry, lang = 'es') {
  const lines = [pick(entry.summary, lang), '']
  for (const h of entry.highlights || []) {
    lines.push(`### ${h.icon ? `${h.icon} ` : ''}${pick(h.title, lang)}`, '', pick(h.body, lang), '')
  }
  return lines.join('\n').trim()
}

/** Texto plano para la ficha de Play: resumen + títulos de highlights, <=500 chars. */
export function toPlayNotes(entry, lang = 'es') {
  const summary = pick(entry.summary, lang).trim()
  let text = summary

  // Los bullets entran enteros mientras quepan: nunca se corta a media línea.
  for (const h of entry.highlights || []) {
    const candidate = `${text}\n${text === summary ? '\n' : ''}• ${pick(h.title, lang)}`
    if (candidate.length > PLAY_NOTES_MAX) break
    text = candidate
  }

  if (text.length > PLAY_NOTES_MAX) {
    text = `${text.slice(0, PLAY_NOTES_MAX - 1).replace(/\s+\S*$/, '')}…`
  }
  return text
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const version = args.find((a) => !a.startsWith('--'))
  const flag = (name, fallback) => {
    const i = args.indexOf(`--${name}`)
    return i === -1 ? fallback : args[i + 1]
  }
  if (!version) {
    console.error('Uso: node scripts/extract-changelog-entry.mjs <version> [--lang es|en] [--format markdown|play]')
    process.exit(1)
  }
  const lang = flag('lang', 'es')
  const format = flag('format', 'markdown')
  const entry = entryFor(version)
  process.stdout.write(
    (format === 'play' ? toPlayNotes(entry, lang) : toMarkdown(entry, lang)) + '\n',
  )
}
