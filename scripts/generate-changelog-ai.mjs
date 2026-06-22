#!/usr/bin/env node
/**
 * generate-changelog-ai.mjs
 *
 * Turns the raw conventional commits of a mobile release into a FRIENDLY,
 * BILINGUAL (es/en) changelog entry and merges it into
 * `packages/core/data/changelog.mobile.json` — the file the native
 * "Novedades" (WhatsNewModal) sheet reads.
 *
 * Why a build-time step: the content is static per release, so we front-load
 * both languages once (offline + zero latency/cost on device). It reuses the
 * existing release machinery instead of an on-device endpoint.
 *
 * Usage:
 *   node scripts/generate-changelog-ai.mjs              # version from app.json, range = last mobile tag..HEAD
 *   node scripts/generate-changelog-ai.mjs 1.0.5        # explicit version
 *   node scripts/generate-changelog-ai.mjs 1.0.5 mobile-v1.0.4   # explicit version + base tag
 *
 * Env:
 *   ANTHROPIC_API_KEY      required for the AI pass (without it: graceful, raw fallback)
 *   CHANGELOG_AI_MODEL     optional, default "claude-haiku-4-5-20251001"
 *
 * Non-fatal by design: any AI failure logs a warning and writes a raw fallback
 * entry so a release never blocks on the LLM. Run AFTER bumping app.json and
 * BEFORE tagging `mobile-v<version>`.
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUTPUT = resolve(ROOT, 'packages/core/data/changelog.mobile.json')
const APP_JSON = resolve(ROOT, 'apps/mobile/app.json')

const MODEL = process.env.CHANGELOG_AI_MODEL || 'claude-haiku-4-5-20251001'
const API_KEY = process.env.ANTHROPIC_API_KEY

// ── git helpers ────────────────────────────────────────────────────────────────

function git(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim()
}

/** Latest released mobile tag (mobile-v1.2.3, ignoring -build.* prereleases). */
function lastMobileTag() {
  try {
    const raw = git('git tag -l "mobile-v*" --sort=-v:refname')
    const tags = raw ? raw.split('\n').filter(Boolean) : []
    return tags.find((t) => /^mobile-v\d+\.\d+\.\d+$/.test(t)) || null
  } catch {
    return null
  }
}

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
      .map((block) => {
        const lines = block.trim().split('\n')
        const [hash, subject, ...bodyLines] = lines
        const date = bodyLines.pop()
        return { hash, subject, body: bodyLines.join('\n').trim(), date }
      })
  } catch {
    return []
  }
}

// ── conventional commit parsing (mirrors generate-changelog.mjs) ─────────────────

const TYPE_MAP = {
  feat: { label: 'Nuevas funciones', emoji: '✨', order: 0 },
  fix: { label: 'Correcciones', emoji: '🐛', order: 1 },
  perf: { label: 'Rendimiento', emoji: '⚡', order: 2 },
  refactor: { label: 'Mejoras internas', emoji: '♻️', order: 3 },
}

const COMMIT_RE = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/

function parseCommit(raw) {
  const match = raw.subject.match(COMMIT_RE)
  if (!match) {
    return { type: 'other', scope: null, breaking: false, description: raw.subject, hash: raw.hash.slice(0, 7) }
  }
  const [, type, scope, bang, description] = match
  return {
    type: type.toLowerCase(),
    scope: scope || null,
    breaking: !!bang || /BREAKING[ -]CHANGE/i.test(raw.body),
    description: description.charAt(0).toUpperCase() + description.slice(1),
    hash: raw.hash.slice(0, 7),
  }
}

function buildGroups(commits) {
  const groups = {}
  for (const c of commits) {
    if (!TYPE_MAP[c.type] && !c.breaking) continue // user-facing types only
    const meta = TYPE_MAP[c.type]
    if (!meta) continue
    if (!groups[c.type]) groups[c.type] = { ...meta, type: c.type, items: [] }
    groups[c.type].items.push({
      description: c.description,
      scope: c.scope,
      breaking: c.breaking,
      hash: c.hash,
    })
  }
  return Object.values(groups)
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...g }) => g)
}

// ── AI pass ──────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres el escritor de producto de una app de calistenia (entreno con peso corporal), de voz atlética, directa y sin relleno. Conviertes commits técnicos en notas de versión "Novedades" para usuarios reales.

Reglas:
- Devuelve SOLO un objeto JSON válido, sin markdown ni texto extra.
- Bilingüe: cada campo de texto tiene "es" y "en". El "es" es el primario (la app es spanish-first); el "en" es una traducción natural, no literal.
- "summary": una frase (<= 120 caracteres) que resuma lo más importante de la versión, por idioma.
- "highlights": 3 a 6 entradas, ordenadas por relevancia para el usuario. Agrupa varios commits relacionados en un solo highlight; ignora lo puramente interno (refactors, tests, CI, chore, bumps) salvo que cambie algo visible.
- Cada highlight: { "icon": un emoji adecuado, "type": "feat"|"fix"|"perf", "title": {es,en} (2-4 palabras, sin punto final), "body": {es,en} (1 frase clara, orientada al beneficio para el usuario) }.
- Nada de jerga técnica ni nombres de archivos/PRs. Habla de lo que el usuario puede hacer ahora.`

function buildUserPrompt(version, groups) {
  const lines = groups.flatMap((g) =>
    g.items.map((it) => `- [${g.type}] ${it.scope ? `(${it.scope}) ` : ''}${it.description}`),
  )
  return `Versión: ${version}\n\nCommits de esta versión:\n${lines.join('\n')}\n\nGenera el JSON con esta forma exacta:\n{"summary":{"es":"","en":""},"highlights":[{"icon":"","type":"feat","title":{"es":"","en":""},"body":{"es":"","en":""}}]}`
}

function extractJson(text) {
  // El modelo a veces envuelve en ```json … ``` — extrae el primer objeto {...}.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no JSON object in model output')
  return JSON.parse(candidate.slice(start, end + 1))
}

async function callAnthropic(version, groups) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(version, groups) }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const text = (data.content ?? []).map((b) => b.text ?? '').join('')
  return extractJson(text)
}

// ── fallback (no key / AI failure) ─────────────────────────────────────────────

function dual(s) {
  return { es: s, en: s }
}

function rawFallback(groups) {
  const feats = groups.find((g) => g.type === 'feat')?.items ?? []
  const fixes = groups.find((g) => g.type === 'fix')?.items ?? []
  const pick = [...feats.slice(0, 5), ...fixes.slice(0, 1)]
  return {
    summary: dual('Mejoras y correcciones de esta versión.'),
    highlights: pick.map((it) => ({
      icon: it.breaking ? '⚠️' : '✨',
      type: 'feat',
      title: dual(it.scope ? `${it.scope}` : 'Mejora'),
      body: dual(it.description),
    })),
  }
}

function isValidAi(obj) {
  return (
    obj &&
    obj.summary?.es &&
    obj.summary?.en &&
    Array.isArray(obj.highlights) &&
    obj.highlights.length > 0 &&
    obj.highlights.every((h) => h?.title?.es && h?.title?.en && h?.body?.es && h?.body?.en)
  )
}

// ── merge + write ────────────────────────────────────────────────────────────────

function loadChangelog() {
  if (!existsSync(OUTPUT)) return { generated: '', versions: [] }
  try {
    return JSON.parse(readFileSync(OUTPUT, 'utf-8'))
  } catch {
    return { generated: '', versions: [] }
  }
}

function appVersion() {
  return JSON.parse(readFileSync(APP_JSON, 'utf-8')).expo.version
}

function compareVersions(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

async function main() {
  const version = process.argv[2] || appVersion()
  const baseTag = process.argv[3] || lastMobileTag()
  const today = new Date().toISOString().split('T')[0]

  console.log(`Mobile changelog (AI) → v${version}`)
  console.log(`  range: ${baseTag || '(repo start)'}..HEAD`)

  const commits = getCommits(baseTag, 'HEAD').map(parseCommit)
  const groups = buildGroups(commits)
  if (groups.length === 0) {
    console.warn('  No user-facing commits in range — nothing to add. Skipping.')
    return
  }
  console.log(`  ${groups.reduce((n, g) => n + g.items.length, 0)} user-facing commit(s).`)

  let curated
  if (!API_KEY) {
    console.warn('  ANTHROPIC_API_KEY not set — writing RAW fallback (no AI copy).')
    curated = rawFallback(groups)
  } else {
    try {
      const ai = await callAnthropic(version, groups)
      if (!isValidAi(ai)) throw new Error('AI output failed schema validation')
      curated = ai
      console.log(`  AI copy generated via ${MODEL} (${ai.highlights.length} highlights).`)
    } catch (err) {
      console.warn(`  AI pass failed (${err.message}) — writing RAW fallback.`)
      curated = rawFallback(groups)
    }
  }

  const entry = {
    version,
    date: today,
    summary: curated.summary,
    highlights: curated.highlights,
    groups,
  }

  const changelog = loadChangelog()
  changelog.versions = (changelog.versions || []).filter((v) => v.version !== version)
  changelog.versions.push(entry)
  changelog.versions.sort((a, b) => compareVersions(b.version, a.version)) // newest first
  changelog.generated = new Date().toISOString()

  writeFileSync(OUTPUT, JSON.stringify(changelog, null, 2) + '\n', 'utf-8')
  console.log(`Done → ${OUTPUT}`)

  // Keep the human-readable CHANGELOG.md / CHANGELOG.es.md in sync (non-fatal).
  try {
    execSync('node scripts/generate-changelog-md.mjs', { cwd: ROOT, stdio: 'inherit' })
  } catch (err) {
    console.warn(`  Markdown regen skipped: ${err.message}`)
  }
}

main().catch((err) => {
  // Never block a release on this script.
  console.warn(`generate-changelog-ai failed: ${err.message}`)
  process.exit(0)
})
