#!/usr/bin/env node
/**
 * openpanel-retention-report.mjs — Informe de retención semanal reproducible
 * desde OpenPanel (issue #826).
 *
 * ## Por qué existe
 *
 * El análisis de retención del 2026-09-22 (el que abrió la épica #791) se hizo
 * a mano contra el panel de OpenPanel: consultas ad hoc, exclusión manual de
 * la cuenta Demo Play + el dev + su amiga, cálculo manual de D1/D7. Cada vez
 * que alguien quisiera repetirlo tendría que rehacer ese trabajo exploratorio
 * desde cero, con riesgo de contar mal — la propia investigación de retención
 * ya señaló "NO agrupar por deviceId" como un error cometido una vez. Este
 * script fija el criterio una sola vez y lo hace reproducible.
 *
 * ## Mecanismo de lectura — DECISIÓN (con evidencia)
 *
 * OpenPanel expone una API de exportación OFICIAL y documentada:
 * `GET {apiUrl}/export/events` (https://openpanel.dev/docs/api/export), con
 * cabeceras `openpanel-client-id` / `openpanel-client-secret`. Es la opción
 * elegida en vez del tRPC interno del dashboard (que necesitaría la sesión de
 * navegador de Guillermo y no es una API soportada — se rompería en cualquier
 * actualización del panel sin aviso).
 *
 * Verificado contra la instancia self-hosted real (2026-09-23):
 *   - `GET https://openpanel.guille.tech/api/` → 200, confirma que el host y
 *     la ruta `/api` son los correctos.
 *   - `GET https://openpanel.guille.tech/api/export/events` con el cliente de
 *     INGESTA que ya usan las apps (`VITE_OPENPANEL_CLIENT_ID` +
 *     `OPENPANEL_CLIENT_SECRET` del `.env` raíz) → 401
 *     `{"error":"Unauthorized","message":"Export: Client is not allowed to
 *     export"}`. Confirma lo que la documentación anticipa: un cliente creado
 *     con el proyecto nace en modo `write` (solo ingesta) y el export exige un
 *     cliente `read` o `root` — DISTINTO del que usan las apps para mandar
 *     eventos. Ver `docs/business/10-retention-report.md` para cómo crear ese
 *     cliente nuevo en el dashboard.
 *
 * Caveats conocidos de esta API (de la documentación y de issues públicas del
 * proyecto OpenPanel, no verificados aquí por falta de credenciales de
 * lectura):
 *   - Límite de tasa: 100 peticiones / 10 s por client id.
 *   - `limit` máximo 1000 por página; paginar con `page`.
 *   - Ha habido reportes de que `properties` no siempre viaja en el evento
 *     aunque `includes=profile,meta` lo pida (openpanel-dev/openpanel#281).
 *     Este script asume que puede faltar y lo trata como ausente, nunca como
 *     un error — ver `computeFirstWorkoutAbandonment()`.
 *
 * ## Qué NO hace
 *
 * No toca `apps/web`, `apps/mobile` ni `packages/core` — solo LEE sus
 * contratos de eventos para no inventarse nombres. No escribe nada en el
 * repo por defecto: la salida va a stdout, y `--out <fichero>` es cosa del
 * usuario (avisa si el destino no parece un path ignorado por git). El repo
 * es PÚBLICO: nunca hardcodear aquí — ni loguear nunca — ids de perfil,
 * nombres, emails ni números reales de un informe ya generado.
 *
 * ## Uso
 *
 *   node --env-file=.env scripts/openpanel-retention-report.mjs \
 *     --from 2026-08-20 --to 2026-09-22 [--platform mobile|web|both] \
 *     [--out informe.md.local]
 *
 *   pnpm report:retention -- --from 2026-08-20 --to 2026-09-22
 *
 * ## Credenciales (nunca hardcodeadas, nunca en el repo)
 *
 *   OPENPANEL_READ_CLIENT_ID / OPENPANEL_READ_CLIENT_SECRET
 *     Cliente con acceso `read` (o `root`), uno para los dos proyectos si el
 *     dashboard permite clientes a nivel de organización.
 *   OPENPANEL_READ_CLIENT_ID_MOBILE / OPENPANEL_READ_CLIENT_SECRET_MOBILE
 *   OPENPANEL_READ_CLIENT_ID_WEB / OPENPANEL_READ_CLIENT_SECRET_WEB
 *     Alternativa si el dashboard solo permite clientes por proyecto — tienen
 *     prioridad sobre el par genérico de arriba, por plataforma.
 *   OPENPANEL_CORE_PROFILE_IDS
 *     Lista separada por comas de ids de perfil a excluir del informe además
 *     de Demo Play (dev + amiga…). Es una decisión de REPORTING, no de la
 *     app: esas cuentas SÍ mandan eventos reales y no deben excluirse del
 *     `ANALYTICS_EXCLUDED_PROFILE_IDS` de la app.
 *   OPENPANEL_BASE_URL (opcional, por defecto https://openpanel.guille.tech/api)
 *   OPENPANEL_PROJECT_ID_MOBILE / OPENPANEL_PROJECT_ID_WEB (opcional, por
 *     defecto 'calistenia-app' / 'tech' — ver docs/business/10-retention-report.md)
 *
 * Ver `docs/business/10-retention-report.md` para el resto: qué proyecto es
 * cuál, cómo crear y renovar el cliente de lectura, y las decisiones de
 * métrica (ancla del embudo, D1/D7, aproximación de abandono).
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname, join, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── Contrato de eventos (solo lectura — ver packages/core/lib/session-funnel.ts
//    y packages/core/hooks/useAuth.ts) ───────────────────────────────────────

/**
 * El embudo, en orden. `session_started` es el evento PROPIO de la app (el
 * `TRAINING_FUNNEL_EVENTS.sessionStarted` de `packages/core/lib/session-funnel.ts`,
 * que se emite al arrancar una sesión de entreno — incluida una de prueba sin
 * cuenta, de ahí que pueda ir ANTES de `signup_completed`), no el
 * `session_start` automático de OpenPanel.
 *
 * DECISIÓN: se usa el evento propio de la app para TODO el embudo (incluida
 * la señal de "volvió" de D1/D7) en vez del automático de OpenPanel, porque:
 *   1. Es el mismo contrato que ya usan `workout_completed` y
 *      `workout_abandoned` — mezclar un evento automático con el resto del
 *      embudo habría hecho que los pasos no fueran comparables entre sí.
 *   2. El automático de OpenPanel cuenta CUALQUIER visita (recarga de página,
 *      apertura en segundo plano en móvil…), no una intención de entrenar;
 *      habría inflado el primer escalón sin decir nada sobre retención real.
 */
export const FUNNEL_STEPS = [
  { key: 'session_started', label: 'Sesión iniciada (entreno)' },
  { key: 'signup_completed', label: 'Registro completado' },
  { key: 'onboarding_completed', label: 'Onboarding completado' },
  { key: 'first_workout_started', label: 'Primer entreno iniciado' },
  { key: 'workout_completed', label: 'Entreno completado' },
]

/** Todos los nombres de evento que el script necesita pedirle a OpenPanel. */
export const REQUIRED_EVENT_NAMES = [
  ...FUNNEL_STEPS.map(s => s.key),
  'workout_abandoned',
]

/**
 * Proyectos de OpenPanel por plataforma. Verificados contra
 * `apps/mobile/src/lib/init-core.ts` (móvil) y la investigación de retención
 * previa registrada en la memoria del proyecto (web = `tech`; el slug de la
 * URL del dashboard, `calistenia`, NO es el id). Sobrescribibles por env por
 * si el dashboard cambia o esto estaba mal — el script nunca deja de arrancar
 * por esto, solo usa el valor que le den.
 */
export const DEFAULT_PROJECT_IDS = {
  mobile: 'calistenia-app',
  web: 'tech',
}

/**
 * Excluidos de lo que la propia app manda a OpenPanel — copia de
 * `packages/core/lib/analytics.ts::ANALYTICS_EXCLUDED_PROFILE_IDS` (Demo
 * Play). Es una copia y no un import porque los scripts de `scripts/` corren
 * con Node puro (sin bundler) y ese módulo importa rutas sin extensión
 * (`from '../platform'`) que solo resuelven bajo Vite/Metro — intentar
 * importarlo aquí revienta en tiempo de ejecución. `checkAnalyticsExclusionSync()`
 * más abajo comprueba en cada arranque que esta copia no se haya desincronizado
 * del original.
 */
export const DEMO_PLAY_EXCLUDED_PROFILE_IDS = new Set(['7imoyrw39rritud'])

// ── Utilidades puras (testeadas en openpanel-retention-report.test.mjs) ─────

/** Perfiles a excluir del informe: Demo Play + la lista "core" del env. */
export function parseCoreExcludedProfileIds(envValue) {
  return new Set(
    String(envValue ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  )
}

/**
 * Extrae los ids del `Set` de `ANALYTICS_EXCLUDED_PROFILE_IDS` directamente
 * del texto fuente de `analytics.ts`, sin importarlo. Si el fichero cambia de
 * forma (otro nombre de export, otra sintaxis) devuelve `null` en vez de
 * reventar: un aviso de "no pude comprobar" es aceptable, un script que no
 * arranca por esto no lo es.
 */
export function extractAnalyticsExcludedIds(sourceText) {
  const m = sourceText.match(/ANALYTICS_EXCLUDED_PROFILE_IDS[^=]*=\s*new Set\(\[([^\]]*)\]\)/)
  if (!m) return null
  const ids = [...m[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map(x => x[1] ?? x[2])
  return new Set(ids)
}

/** Un id de perfil ANÓNIMO de OpenPanel (previo a `identify()`) es hex-32. */
export function isLikelyAnonymousProfileId(id) {
  return typeof id === 'string' && /^[a-f0-9]{32}$/i.test(id)
}

export function excludeProfiles(events, excludedIds) {
  return events.filter(e => !excludedIds.has(e.profileId))
}

/** Día calendario UTC, como entero — para "el día 1", "el día 7". */
export function utcDayIndex(ms) {
  return Math.floor(ms / 86_400_000)
}

/**
 * Semana ISO-8601 (lunes a domingo, UTC) como clave ordenable, p.ej.
 * `2026-W38`. Por cohortes: agrupar los registros por semana natural es lo
 * que deja comparar "esta semana contra la anterior" sin arrastrar el sesgo
 * de una cohorte a medio formar.
 */
export function isoWeekKey(ms) {
  const d = new Date(Math.floor(ms / 86_400_000) * 86_400_000)
  // ISO: el jueves de la semana decide a qué año pertenece.
  const dayNum = (d.getUTCDay() + 6) % 7 // lunes=0 … domingo=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const firstThursdayDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNum + 3)
  const week = 1 + Math.round((d - firstThursday) / (7 * 86_400_000))
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function countDistinctProfiles(events) {
  return new Set(events.map(e => e.profileId)).size
}

/** El evento más temprano de cada perfil, indexado por `profileId`. */
export function earliestByProfile(events) {
  const out = new Map()
  for (const e of events) {
    const prev = out.get(e.profileId)
    if (!prev || e.createdAt < prev.createdAt) out.set(e.profileId, e)
  }
  return out
}

/**
 * El embudo completo de una plataforma: perfiles DISTINTOS por paso (no
 * eventos — `set_logged`/`workout_completed` pueden repetirse por perfil y
 * contar eventos habría inflado los pasos de en medio frente a los extremos).
 * `eventsByStep[key]` ya debe venir filtrado al rango de fechas y sin
 * perfiles excluidos.
 */
export function computeFunnel(eventsByStep) {
  let previous = null
  let first = null
  return FUNNEL_STEPS.map(({ key, label }) => {
    const profiles = countDistinctProfiles(eventsByStep[key] ?? [])
    if (first == null) first = profiles
    const row = {
      key,
      label,
      profiles,
      pctOfPrevious: previous == null ? null : previous === 0 ? 0 : Math.round((profiles / previous) * 1000) / 10,
      pctOfFirst: first === 0 ? 0 : Math.round((profiles / first) * 1000) / 10,
    }
    previous = profiles
    return row
  })
}

/**
 * D1/D7 por cohorte semanal de `signup_completed` (ancla elegida, ver el
 * bloque grande de arriba). "Volvió el día N" = tiene un `session_started`
 * cuyo día calendario UTC es exactamente el día del registro + N — no una
 * ventana móvil de 24 h: una ventana móvil desplazaría la cohorte según la
 * hora del día en que cada quien se registró, y "día 1" dejaría de significar
 * lo mismo para todos.
 */
export function computeCohortRetention(signupEvents, activityEvents, { days = [1, 7] } = {}) {
  const signupByProfile = earliestByProfile(signupEvents)
  const activityDaysByProfile = new Map()
  for (const e of activityEvents) {
    if (!activityDaysByProfile.has(e.profileId)) activityDaysByProfile.set(e.profileId, new Set())
    activityDaysByProfile.get(e.profileId).add(utcDayIndex(e.createdAt))
  }

  const cohorts = new Map() // week -> { size, returned: Map<day, count> }
  for (const [profileId, signup] of signupByProfile) {
    const week = isoWeekKey(signup.createdAt)
    if (!cohorts.has(week)) {
      cohorts.set(week, { week, size: 0, returned: new Map(days.map(d => [d, 0])) })
    }
    const cohort = cohorts.get(week)
    cohort.size += 1
    const signupDay = utcDayIndex(signup.createdAt)
    const activeDays = activityDaysByProfile.get(profileId)
    if (activeDays) {
      for (const d of days) {
        if (activeDays.has(signupDay + d)) cohort.returned.set(d, cohort.returned.get(d) + 1)
      }
    }
  }

  const rows = [...cohorts.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map(c => ({
      week: c.week,
      size: c.size,
      retention: Object.fromEntries(days.map(d => {
        const returned = c.returned.get(d)
        return [d, { returned, rate: c.size === 0 ? 0 : Math.round((returned / c.size) * 1000) / 10 }]
      })),
    }))

  const totalSize = rows.reduce((s, r) => s + r.size, 0)
  const overall = Object.fromEntries(days.map(d => {
    const returned = rows.reduce((s, r) => s + r.retention[d].returned, 0)
    return [d, { returned, rate: totalSize === 0 ? 0 : Math.round((returned / totalSize) * 1000) / 10 }]
  }))

  return { cohorts: rows, overall, totalSize }
}

/**
 * Métrica norte: % de usuarios nuevos (con `signup_completed` en el rango)
 * que llegan a `threshold` `workout_completed` dentro de sus primeros
 * `windowDays` días DESDE EL REGISTRO — no desde `session_started` ni desde
 * `first_workout_started`: "sus primeros N días" es una propiedad del
 * USUARIO (desde que existe la cuenta), no de una sesión concreta, y usar el
 * registro como ancla es lo único que deja comparar cohortes de semanas
 * distintas con la misma vara.
 */
export function computeNorthStar(signupEvents, workoutCompletedEvents, { windowDays = 7, threshold = 3 } = {}) {
  const signupByProfile = earliestByProfile(signupEvents)
  const completionsByProfile = new Map()
  for (const e of workoutCompletedEvents) {
    if (!completionsByProfile.has(e.profileId)) completionsByProfile.set(e.profileId, [])
    completionsByProfile.get(e.profileId).push(e.createdAt)
  }

  let qualifying = 0
  const cohortSize = signupByProfile.size
  for (const [profileId, signup] of signupByProfile) {
    const windowEnd = signup.createdAt + windowDays * 86_400_000
    const completions = completionsByProfile.get(profileId) ?? []
    const inWindow = completions.filter(ts => ts >= signup.createdAt && ts < windowEnd).length
    if (inWindow >= threshold) qualifying += 1
  }

  return {
    cohortSize,
    qualifying,
    rate: cohortSize === 0 ? 0 : Math.round((qualifying / cohortSize) * 1000) / 10,
    windowDays,
    threshold,
  }
}

/**
 * Abandono del PRIMER entreno.
 *
 * Vía primaria: `workout_abandoned.is_first_workout` (issue #823, en marcha
 * en paralelo — puede no existir todavía en los datos). Si NINGÚN evento de
 * abandono del rango trae esa propiedad, se cae a la aproximación de
 * respaldo que pide la issue: el primer `first_workout_started` de cada
 * perfil sin un `workout_completed` suyo dentro de `fallbackWindowHours`
 * después. Es una aproximación a propósito — puede contar como abandono a
 * alguien que retomó el mismo entreno mucho más tarde — y el resultado dice
 * qué vía usó (`method`) para que el informe nunca mezcle números de una
 * fuente con otra sin decirlo.
 */
export function computeFirstWorkoutAbandonment(
  firstWorkoutStartedEvents,
  workoutCompletedEvents,
  workoutAbandonedEvents,
  { fallbackWindowHours = 24 } = {},
) {
  const cohortSize = countDistinctProfiles(firstWorkoutStartedEvents)

  const hasIsFirstWorkoutData = workoutAbandonedEvents.some(
    e => e.properties != null && Object.prototype.hasOwnProperty.call(e.properties, 'is_first_workout'),
  )

  if (hasIsFirstWorkoutData) {
    const abandonedProfiles = new Set(
      workoutAbandonedEvents.filter(e => e.properties?.is_first_workout === true).map(e => e.profileId),
    )
    return {
      method: 'is_first_workout',
      cohortSize,
      abandoned: abandonedProfiles.size,
      rate: cohortSize === 0 ? 0 : Math.round((abandonedProfiles.size / cohortSize) * 1000) / 10,
    }
  }

  const firstStartByProfile = earliestByProfile(firstWorkoutStartedEvents)
  const completionsByProfile = new Map()
  for (const e of workoutCompletedEvents) {
    if (!completionsByProfile.has(e.profileId)) completionsByProfile.set(e.profileId, [])
    completionsByProfile.get(e.profileId).push(e.createdAt)
  }

  let abandoned = 0
  const windowMs = fallbackWindowHours * 3_600_000
  for (const [profileId, start] of firstStartByProfile) {
    const completions = completionsByProfile.get(profileId) ?? []
    const matched = completions.some(ts => ts >= start.createdAt && ts <= start.createdAt + windowMs)
    if (!matched) abandoned += 1
  }

  return {
    method: 'fallback_no_matching_completion',
    cohortSize,
    abandoned,
    rate: cohortSize === 0 ? 0 : Math.round((abandoned / cohortSize) * 1000) / 10,
  }
}

// ── Normalización de la respuesta de OpenPanel ──────────────────────────────

/**
 * Convierte un evento crudo de `GET /export/events` a la forma interna que
 * usa el resto del módulo. Los nombres de campo exactos de la respuesta no
 * están confirmados contra la instancia real (sin credenciales de lectura en
 * esta pasada — ver cabecera del fichero), así que se leen de forma
 * defensiva con varios alias plausibles en vez de asumir uno solo.
 */
export function normalizeOpenPanelEvent(raw) {
  const name = raw.name ?? raw.event ?? raw.eventName
  const profileId = raw.profileId ?? raw.profile_id ?? raw.profile?.id
  const createdAtRaw = raw.createdAt ?? raw.created_at ?? raw.timestamp
  const createdAt = createdAtRaw instanceof Date ? createdAtRaw.getTime() : new Date(createdAtRaw).getTime()
  return {
    event: name,
    profileId,
    createdAt,
    properties: raw.properties ?? null,
  }
}

// ── .env opcional (sin dependencias — los scripts de este repo no usan dotenv) ─

export function parseDotEnv(content) {
  const out = {}
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function loadDotEnvIfPresent(path) {
  let content
  try {
    content = readFileSync(path, 'utf8')
  } catch {
    return // sin .env no es un error — CI y este worktree no lo tienen.
  }
  for (const [key, value] of Object.entries(parseDotEnv(content))) {
    if (process.env[key] === undefined) process.env[key] = value
  }
}

// ── Renderizado del informe ──────────────────────────────────────────────────

function fmtPct(rate) {
  return `${rate.toFixed(1)}%`
}

function renderFunnelTable(rows) {
  const lines = ['| Paso | Perfiles | % del anterior | % del primero |', '| --- | --- | --- | --- |']
  for (const r of rows) {
    lines.push(
      `| ${r.label} | ${r.profiles} | ${r.pctOfPrevious == null ? '—' : fmtPct(r.pctOfPrevious)} | ${fmtPct(r.pctOfFirst)} |`,
    )
  }
  return lines.join('\n')
}

function renderCohortTable(cohortResult, days) {
  const header = `| Semana | Cohorte | ${days.map(d => `D${d}`).join(' | ')} |`
  const sep = `| --- | --- | ${days.map(() => '---').join(' | ')} |`
  const lines = [header, sep]
  for (const c of cohortResult.cohorts) {
    lines.push(
      `| ${c.week} | ${c.size} | ${days.map(d => `${c.retention[d].returned} (${fmtPct(c.retention[d].rate)})`).join(' | ')} |`,
    )
  }
  lines.push(
    `| **Total** | **${cohortResult.totalSize}** | ${days.map(d => `**${cohortResult.overall[d].returned} (${fmtPct(cohortResult.overall[d].rate)})**`).join(' | ')} |`,
  )
  return lines.join('\n')
}

/**
 * Compone el informe en Markdown para una plataforma. Función pura: toma los
 * resultados ya calculados, no hace I/O — así se puede testear sin red.
 */
export function renderPlatformReport(platform, { from, to, funnel, cohortRetention, northStar, abandonment, caveats }) {
  const lines = []
  lines.push(`## ${platform}`, '')
  lines.push(`Rango: ${from} → ${to}`, '')
  lines.push('### Embudo', '', renderFunnelTable(funnel), '')
  lines.push(
    '### D1 / D7 por cohorte semanal (ancla: `signup_completed`; "volvió" = `session_started`)',
    '',
    renderCohortTable(cohortRetention, [1, 7]),
    '',
  )
  lines.push(
    '### Métrica norte',
    '',
    `${northStar.qualifying} / ${northStar.cohortSize} usuarios nuevos (${fmtPct(northStar.rate)}) con ≥${northStar.threshold} \`workout_completed\` en sus primeros ${northStar.windowDays} días desde el registro.`,
    '',
  )
  lines.push(
    '### Abandono del primer entreno',
    '',
    abandonment.method === 'is_first_workout'
      ? `${abandonment.abandoned} / ${abandonment.cohortSize} (${fmtPct(abandonment.rate)}) — medido con \`workout_abandoned.is_first_workout\`.`
      : `${abandonment.abandoned} / ${abandonment.cohortSize} (${fmtPct(abandonment.rate)}) — **aproximación**: \`first_workout_started\` sin un \`workout_completed\` suyo en las 24 h siguientes (\`workout_abandoned.is_first_workout\` de la #823 todavía no está en los datos del rango).`,
    '',
  )
  if (caveats?.length) {
    lines.push('### Avisos', '', ...caveats.map(c => `- ${c}`), '')
  }
  return lines.join('\n')
}

// ── Cliente HTTP de la API de exportación ───────────────────────────────────

async function fetchEventsPage({ baseUrl, clientId, clientSecret, projectId, event, from, to, page, limit }) {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/export/events`)
  url.searchParams.set('projectId', projectId)
  url.searchParams.set('event', event)
  url.searchParams.set('start', from)
  url.searchParams.set('end', to)
  url.searchParams.set('page', String(page))
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('includes', 'profile,meta')

  const res = await fetch(url, {
    headers: {
      'openpanel-client-id': clientId,
      'openpanel-client-secret': clientSecret,
    },
  })

  if (res.status === 429) {
    // 100 peticiones / 10 s por client id (documentado) — un backoff simple
    // basta para el volumen de este informe (unas pocas peticiones por
    // plataforma y rango).
    await new Promise(r => setTimeout(r, 2000))
    return fetchEventsPage({ baseUrl, clientId, clientSecret, projectId, event, from, to, page, limit })
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenPanel export/events ${res.status} para "${event}": ${body.slice(0, 300)}`)
  }

  return res.json()
}

async function fetchAllEvents({ baseUrl, clientId, clientSecret, projectId, event, from, to }) {
  const limit = 1000
  let page = 1
  const all = []
  for (;;) {
    const json = await fetchEventsPage({ baseUrl, clientId, clientSecret, projectId, event, from, to, page, limit })
    const data = Array.isArray(json.data) ? json.data : []
    all.push(...data.map(normalizeOpenPanelEvent))
    const pages = json.meta?.pages ?? 1
    if (page >= pages || data.length === 0) break
    page += 1
  }
  return all
}

// ── CLI ───────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = { platform: 'both', out: null, from: null, to: null }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--from') args.from = argv[++i]
    else if (a === '--to') args.to = argv[++i]
    else if (a === '--platform') args.platform = argv[++i]
    else if (a === '--out') args.out = argv[++i]
  }
  return args
}

function readCredentials(platform) {
  const upper = platform.toUpperCase()
  const clientId = process.env[`OPENPANEL_READ_CLIENT_ID_${upper}`] ?? process.env.OPENPANEL_READ_CLIENT_ID
  const clientSecret = process.env[`OPENPANEL_READ_CLIENT_SECRET_${upper}`] ?? process.env.OPENPANEL_READ_CLIENT_SECRET
  return { clientId, clientSecret }
}

async function runPlatform(platform, { from, to, excludedIds }) {
  const baseUrl = process.env.OPENPANEL_BASE_URL || 'https://openpanel.guille.tech/api'
  const projectId = process.env[`OPENPANEL_PROJECT_ID_${platform.toUpperCase()}`] || DEFAULT_PROJECT_IDS[platform]
  const { clientId, clientSecret } = readCredentials(platform)

  if (!clientId || !clientSecret) {
    throw new Error(
      `Faltan credenciales de lectura para "${platform}". Define OPENPANEL_READ_CLIENT_ID` +
      ` / OPENPANEL_READ_CLIENT_SECRET (o su variante _${platform.toUpperCase()}) — ver` +
      ' docs/business/10-retention-report.md para crear ese cliente en el dashboard.',
    )
  }

  const eventsByStep = {}
  const caveats = []
  for (const eventName of REQUIRED_EVENT_NAMES) {
    const raw = await fetchAllEvents({ baseUrl, clientId, clientSecret, projectId, event: eventName, from, to })
    eventsByStep[eventName] = excludeProfiles(raw, excludedIds)
  }

  const webAnonCount = platform === 'web'
    ? eventsByStep.session_started.filter(e => isLikelyAnonymousProfileId(e.profileId)).length
    : 0
  if (webAnonCount > 0) {
    caveats.push(
      `${webAnonCount} evento(s) de \`session_started\` en perfiles con id anónimo de 32` +
      ' caracteres (visitas antes de `identify()`, no fusionadas aquí) — el primer escalón del' +
      ' embudo puede estar inflado frente a los pasos que ya requieren cuenta.',
    )
  }
  if (eventsByStep.workout_abandoned.length > 0 && eventsByStep.workout_abandoned.every(e => e.properties == null)) {
    caveats.push(
      'Ningún `workout_abandoned` del rango trae `properties` — puede ser el bug conocido de' +
      ' OpenPanel (export/events#281) o que la #823 aún no esté desplegada. Se usó la' +
      ' aproximación de respaldo para el abandono del primer entreno.',
    )
  }

  const funnel = computeFunnel(eventsByStep)
  const cohortRetention = computeCohortRetention(eventsByStep.signup_completed, eventsByStep.session_started)
  const northStar = computeNorthStar(eventsByStep.signup_completed, eventsByStep.workout_completed)
  const abandonment = computeFirstWorkoutAbandonment(
    eventsByStep.first_workout_started,
    eventsByStep.workout_completed,
    eventsByStep.workout_abandoned,
  )

  return renderPlatformReport(platform, { from, to, funnel, cohortRetention, northStar, abandonment, caveats })
}

async function main() {
  loadDotEnvIfPresent(join(ROOT, '.env'))

  const args = parseArgs(process.argv.slice(2))
  if (!args.from || !args.to) {
    console.error('Uso: node scripts/openpanel-retention-report.mjs --from YYYY-MM-DD --to YYYY-MM-DD [--platform mobile|web|both] [--out fichero]')
    process.exit(1)
  }

  const platforms = args.platform === 'both' ? ['mobile', 'web'] : [args.platform]

  let analyticsSourceIds = null
  try {
    analyticsSourceIds = extractAnalyticsExcludedIds(
      readFileSync(join(ROOT, 'packages/core/lib/analytics.ts'), 'utf8'),
    )
  } catch {
    // Si el fichero no se puede leer desde este worktree, seguimos con la
    // copia local — un aviso, no un fallo.
  }
  if (analyticsSourceIds && ![...analyticsSourceIds].every(id => DEMO_PLAY_EXCLUDED_PROFILE_IDS.has(id))) {
    console.error(
      'AVISO: la copia local de ANALYTICS_EXCLUDED_PROFILE_IDS no coincide con' +
      ' packages/core/lib/analytics.ts — actualiza DEMO_PLAY_EXCLUDED_PROFILE_IDS en este script.',
    )
  }

  const excludedIds = new Set([
    ...DEMO_PLAY_EXCLUDED_PROFILE_IDS,
    ...parseCoreExcludedProfileIds(process.env.OPENPANEL_CORE_PROFILE_IDS),
  ])

  const sections = []
  for (const platform of platforms) {
    sections.push(await runPlatform(platform, { from: args.from, to: args.to, excludedIds }))
  }

  const report = [
    '# Informe de retención semanal — OpenPanel',
    '',
    `Generado: ${new Date().toISOString()}`,
    '',
    ...sections,
  ].join('\n')

  console.log(report)

  if (args.out) {
    const outPath = isAbsolute(args.out) ? args.out : resolve(process.cwd(), args.out)
    if (outPath.startsWith(ROOT) && !/\.local(\.|$)/.test(outPath) && !outPath.includes('/reports/')) {
      console.error(
        `AVISO: "${args.out}" está dentro del repo y no parece un path ignorado por git` +
        ' (ni termina en .local ni vive bajo reports/). Revisa .gitignore antes de hacer' +
        ' `git add` — este informe puede llevar números reales de usuarios.',
      )
    }
    const { writeFileSync } = await import('node:fs')
    writeFileSync(outPath, report, 'utf8')
    console.error(`\nGuardado en ${outPath}`)
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  main().catch(err => {
    console.error(err.message)
    process.exit(1)
  })
}
