#!/usr/bin/env node
/**
 * generate-changelog-md.mjs
 *
 * Renders human-readable "Keep a Changelog" files from the curated bilingual
 * source of truth `packages/core/data/changelog.mobile.json`:
 *   - CHANGELOG.md       (English)
 *   - CHANGELOG.es.md    (Español)
 *
 * Format: https://keepachangelog.com/en/1.1.0/  ·  SemVer: https://semver.org
 *
 * Generated, not hand-edited — to change content, edit the JSON (or regenerate it
 * from commits with `scripts/generate-changelog-ai.mjs`) and re-run this script.
 *
 * Usage:  node scripts/generate-changelog-md.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SOURCE = resolve(ROOT, 'packages/core/data/changelog.mobile.json')
const REPO = 'https://github.com/guillermoscript/calistenia-app'
const TAG = (v) => `mobile-v${v}` // mobile release tag convention

// Conventional-commit type → Keep a Changelog section (per skill mapping).
const SECTIONS = {
  feat: { order: 0, en: 'Added', es: 'Añadido' },
  fix: { order: 1, en: 'Fixed', es: 'Corregido' },
  perf: { order: 2, en: 'Changed', es: 'Cambiado' },
  refactor: { order: 2, en: 'Changed', es: 'Cambiado' },
  revert: { order: 3, en: 'Removed', es: 'Eliminado' },
  security: { order: 4, en: 'Security', es: 'Seguridad' },
}

const I18N = {
  en: {
    title: 'Changelog — Calistenia (mobile)',
    intro:
      'All notable changes to the Calistenia mobile app are documented here.\n' +
      'The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), ' +
      'and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n' +
      '> Generated from curated, AI-assisted release notes — do not edit by hand. ' +
      'Source: `packages/core/data/changelog.mobile.json` · regenerate with `pnpm changelog:md`. ' +
      'A Spanish version lives in [`CHANGELOG.es.md`](./CHANGELOG.es.md).',
    unreleased: 'Unreleased',
    nothing: '_Nothing yet._',
  },
  es: {
    title: 'Registro de cambios — Calistenia (móvil)',
    intro:
      'Aquí se documentan todos los cambios relevantes de la app móvil de Calistenia.\n' +
      'El formato se basa en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) ' +
      'y el proyecto sigue el [Versionado Semántico](https://semver.org/lang/es/).\n\n' +
      '> Generado a partir de notas de versión curadas con ayuda de IA — no editar a mano. ' +
      'Fuente: `packages/core/data/changelog.mobile.json` · regenera con `pnpm changelog:md`. ' +
      'La versión en inglés está en [`CHANGELOG.md`](./CHANGELOG.md).',
    unreleased: 'Sin publicar',
    nothing: '_Nada por ahora._',
  },
}

function pick(text, lang) {
  if (!text) return ''
  return text[lang] || text.es || text.en || ''
}

/** Groups a version's highlights into Keep a Changelog sections. */
function sectionsFor(version, lang) {
  const buckets = new Map()
  for (const h of version.highlights ?? []) {
    const sec = SECTIONS[h.type] ?? SECTIONS.feat
    const name = sec[lang]
    if (!buckets.has(name)) buckets.set(name, { order: sec.order, items: [] })
    const title = pick(h.title, lang)
    const body = pick(h.body, lang)
    buckets.get(name).items.push(`- **${title}** — ${body}`)
  }
  return [...buckets.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([name, { items }]) => `### ${name}\n\n${items.join('\n')}`)
}

function renderVersion(version, lang) {
  const head = `## [${version.version}] - ${version.date}`
  const summary = `_${pick(version.summary, lang)}_`
  const body = sectionsFor(version, lang).join('\n\n')
  return [head, '', summary, '', body].join('\n')
}

function renderFooterLinks(versions) {
  const lines = [`[unreleased]: ${REPO}/compare/${TAG(versions[0].version)}...HEAD`]
  for (let i = 0; i < versions.length; i++) {
    const cur = versions[i].version
    const prev = versions[i + 1]?.version
    if (prev) {
      lines.push(`[${cur}]: ${REPO}/compare/${TAG(prev)}...${TAG(cur)}`)
    } else {
      lines.push(`[${cur}]: ${REPO}/releases/tag/${TAG(cur)}`)
    }
  }
  return lines.join('\n')
}

function render(data, lang) {
  const t = I18N[lang]
  const versions = data.versions
  const parts = [
    `# ${t.title}`,
    '',
    t.intro,
    '',
    `## [${t.unreleased}]`,
    '',
    t.nothing,
    '',
    ...versions.map((v) => renderVersion(v, lang) + '\n'),
    renderFooterLinks(versions),
    '',
  ]
  return parts.join('\n')
}

function main() {
  const data = JSON.parse(readFileSync(SOURCE, 'utf-8'))
  if (!data.versions?.length) {
    console.error('No versions in source JSON.')
    process.exit(1)
  }

  const outputs = [
    { lang: 'en', file: resolve(ROOT, 'CHANGELOG.md') },
    { lang: 'es', file: resolve(ROOT, 'CHANGELOG.es.md') },
  ]
  for (const { lang, file } of outputs) {
    writeFileSync(file, render(data, lang), 'utf-8')
    console.log(`Changelog (${lang}) → ${file}`)
  }
  console.log(`  ${data.versions.length} version(s).`)
}

main()
