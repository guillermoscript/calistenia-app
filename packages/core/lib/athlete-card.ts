/**
 * Carné de atleta — lo que la pantalla de perfil enseña ANTES de los ajustes.
 *
 * El perfil dejó de ser un cajón de formularios: primero dice quién eres
 * (nivel, semana del programa, cifras y skills) y los ajustes bajan al final.
 * Las dos derivaciones que eso necesita viven aquí, puras, para que web y
 * móvil pinten exactamente lo mismo (#468: nada de duplicar la regla en cada
 * app y que se separen a la primera).
 */
import { diffDays } from './dateUtils'
import type { ProfilePRs } from './public-profile'

// ─── Skills ──────────────────────────────────────────────────────────────────

export interface SkillDef {
  key: keyof ProfilePRs
  /** Nombre del ejercicio. No se traduce: son anglicismos de calistenia que el
   *  usuario ya usa en español (igual que en el perfil público). */
  label: string
  unit: 'reps' | 's'
  /** Marca que se considera «desbloqueada». */
  goal: number
}

/**
 * Las mismas cinco marcas que enseña el perfil público (`PR_DEFS`), para que
 * «tus skills» y «las skills que ve otro» no puedan discrepar.
 */
export const SKILL_DEFS: SkillDef[] = [
  { key: 'pr_pullups',   label: 'Pull-ups',    unit: 'reps', goal: 20 },
  { key: 'pr_pushups',   label: 'Push-ups',    unit: 'reps', goal: 50 },
  { key: 'pr_lsit',      label: 'L-sit',       unit: 's',    goal: 30 },
  { key: 'pr_pistol',    label: 'Pistol squat', unit: 'reps', goal: 1 },
  { key: 'pr_handstand', label: 'Handstand',   unit: 's',    goal: 60 },
]

export interface AthleteSkill extends SkillDef {
  /** Mejor marca registrada. 0 si nunca se ha hecho. */
  value: number
  /** 0..100, redondeado y tapado en 100. */
  pct: number
  /** `value >= goal`: se pinta en lima. */
  achieved: boolean
}

/**
 * Marcas → skills ordenadas para pintarlas en fila: primero las desbloqueadas
 * (la mejor primero) y luego las que están en camino, de más cerca a más lejos.
 *
 * Acepta el objeto de settings entero a propósito: los cinco `pr_*` legacy se
 * mantienen sincronizados con el mapa `prs` y son los que ya lee el perfil
 * público, así que un `Settings` o una fila de `public_prs` valen igual.
 */
export function buildSkills(prs: Partial<Record<string, number | null | undefined>> | null | undefined): AthleteSkill[] {
  const source = prs ?? {}
  return SKILL_DEFS
    .map((def): AthleteSkill => {
      const raw = Number(source[def.key] ?? 0)
      const value = Number.isFinite(raw) && raw > 0 ? raw : 0
      const pct = def.goal > 0 ? Math.min(100, Math.round((value / def.goal) * 100)) : 0
      return { ...def, value, pct, achieved: value >= def.goal }
    })
    .sort((a, b) => {
      if (a.achieved !== b.achieved) return a.achieved ? -1 : 1
      return b.pct - a.pct
    })
}

// ─── Semana del programa ─────────────────────────────────────────────────────

export interface ProgramWeek {
  /** 1-indexada y tapada en `total`: la semana 30 de un plan de 12 sigue siendo la 12. */
  current: number
  total: number
}

/** Duración por defecto cuando el programa activo no la declara. */
export const DEFAULT_PROGRAM_WEEKS = 26

/**
 * Semana en curso del programa, misma derivación que la barra del dashboard.
 *
 * Sin `startDate` no hay semana que contar: devuelve `null` para que la UI
 * calle en vez de inventarse «Semana 1».
 */
export function programWeek(
  startDate: string | null | undefined,
  durationWeeks: number | null | undefined,
  today: string,
): ProgramWeek | null {
  if (!startDate) return null
  const total = durationWeeks && durationWeeks > 0 ? durationWeeks : DEFAULT_PROGRAM_WEEKS
  const elapsed = diffDays(today, startDate)
  const current = Math.min(total, Math.max(1, Math.floor(elapsed / 7) + 1))
  return { current, total }
}
