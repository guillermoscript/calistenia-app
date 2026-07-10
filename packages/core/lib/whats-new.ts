/**
 * Lógica pura de "Novedades" (what's new) — compartida entre web y mobile, sin
 * imports de plataforma para que sea testeable en node/vitest. El glue de
 * plataforma (versión instalada, storage, JSON) vive en cada componente
 * (WhatsNewModal en mobile, WhatsNew en web).
 *
 * Modelo: el changelog (packages/core/data/changelog.mobile.json) lista versiones
 * de más nueva a más vieja, cada una con `summary` + `highlights` bilingües
 * (curados a mano, no autogenerados) y opcionalmente `groups` técnicos crudos
 * para un expander de detalles. Es el mismo archivo/mensaje para ambas apps —
 * la numeración sigue la línea de versión nativa (app.json), pero el contenido
 * curado normalmente aplica a ambas (la mayoría de la lógica vive en core).
 */

export interface LocalizedText {
  es: string
  en: string
}

export interface ChangelogHighlight {
  /** Emoji que precede al título (autodescriptivo, sin mapa de iconos). */
  icon: string
  /** feat | fix | perf | refactor — solo tiñe el punto; por defecto lima. */
  type?: string
  title: LocalizedText
  body: LocalizedText
}

export interface ChangelogRawItem {
  description: string
  scope?: string | null
  breaking?: boolean
  hash?: string
}

export interface ChangelogRawGroup {
  label: string
  emoji: string
  type: string
  items: ChangelogRawItem[]
}

export interface ChangelogVersion {
  version: string
  date: string
  summary: LocalizedText
  highlights: ChangelogHighlight[]
  /** Crudo derivado de commits — alimenta el expander "Detalles técnicos". */
  groups?: ChangelogRawGroup[]
}

export interface ChangelogData {
  generated: string
  versions: ChangelogVersion[]
}

/**
 * Compara dos versiones semánticas. Devuelve -1 (a<b), 0 (a=b) o 1 (a>b).
 * Tolerante: partes no numéricas o ausentes cuentan como 0.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

/**
 * Versiones que se deben mostrar al usuario, de más nueva a más vieja.
 *
 * Reglas (puras, sin efectos):
 * 1. Solo versiones <= la versión instalada: nunca enseñamos notas de una
 *    versión que el usuario todavía no tiene (red de seguridad si el changelog
 *    se adelanta al build).
 * 2. Primer arranque (sin lastSeen): mostrar la más nueva. Cubre tanto la
 *    instalación nueva como a los usuarios existentes que estrenan la feature.
 * 3. lastSeen == la más nueva publicada: no mostrar nada.
 * 4. En otro caso: mostrar todo lo más nuevo que lastSeen.
 */
export function getUnseenVersions(
  versions: ChangelogVersion[],
  currentVersion: string,
  lastSeen: string | null,
): ChangelogVersion[] {
  const released = versions.filter((v) => compareVersions(v.version, currentVersion) <= 0)
  if (released.length === 0) return []
  if (!lastSeen) return [released[0]]

  const idx = released.findIndex((v) => v.version === lastSeen)
  if (idx === 0) return [] // ya vio la más nueva
  if (idx < 0) {
    // lastSeen no está en la lista: saluda con la más nueva solo si es anterior.
    return compareVersions(lastSeen, released[0].version) < 0 ? [released[0]] : []
  }
  return released.slice(0, idx)
}

/** Texto en el idioma activo con fallback es → en. */
export function pickLang(text: LocalizedText | undefined, lang: string): string {
  if (!text) return ''
  const key = lang.startsWith('en') ? 'en' : 'es'
  return text[key] || text.es || text.en || ''
}

/** Color del punto por tipo. Mayormente lima (un solo acento, sin arcoíris). */
export function dotColorForType(type: string | undefined): string {
  switch (type) {
    case 'fix':
      return '#fbbf24' // amber
    case 'perf':
      return '#38bdf8' // sky
    default:
      return 'hsl(74 90% 45%)' // lime
  }
}
