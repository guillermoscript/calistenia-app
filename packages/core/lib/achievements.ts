/**
 * Logros tempranos y pantalla de logros (#802). CÓDIGO PURO.
 *
 * Tres logros se persisten en `user_achievements` desde el servidor
 * (`pb_hooks/utils/achievements.js`, copia de `evaluateEarlyAchievements`):
 * `first_workout`, `three_workouts` y `first_week_complete`. Los hitos de racha
 * semanal se DERIVAN de la mejor racha (`user_stats.workout_streak_best`) con
 * los mismos hitos que el push de racha (`WEEKLY_STREAK_MILESTONES`, #801), así
 * que no hay filas que mantener ni unidad que pueda divergir.
 *
 * El texto visible sale de los locales por `key` (`achievements.<key>.name` /
 * `.desc`): la base de datos no lleva español fijo.
 */

import { WEEKLY_STREAK_MILESTONES } from './weeklyStreak'

export type PersistedAchievementKey = 'first_workout' | 'three_workouts' | 'first_week_complete'
export type StreakAchievementKey = `streak_${number}w`
export type AchievementKey = PersistedAchievementKey | StreakAchievementKey

/** Qué métrica mide cada logro. */
export type AchievementMetric = 'workouts' | 'weeks'

export interface AchievementDef {
  key: AchievementKey
  icon: string
  metric: AchievementMetric
  target: number
  /** `persisted`: fila en `user_achievements`. `derived`: solo se calcula. */
  source: 'persisted' | 'derived'
}

/** Mismo orden y umbrales que `EARLY` de `pb_hooks/utils/achievements.js`. */
export const EARLY_ACHIEVEMENTS: readonly AchievementDef[] = [
  { key: 'first_workout', icon: '🏁', metric: 'workouts', target: 1, source: 'persisted' },
  { key: 'three_workouts', icon: '💪', metric: 'workouts', target: 3, source: 'persisted' },
  { key: 'first_week_complete', icon: '📅', metric: 'weeks', target: 1, source: 'persisted' },
]

const STREAK_ICONS: Record<number, string> = { 4: '🔥', 8: '⚡', 12: '🏆', 26: '👑', 52: '💎' }

export const STREAK_ACHIEVEMENTS: readonly AchievementDef[] = WEEKLY_STREAK_MILESTONES.map(weeks => ({
  key: `streak_${weeks}w` as StreakAchievementKey,
  icon: STREAK_ICONS[weeks] ?? '🔥',
  metric: 'weeks' as const,
  target: weeks,
  source: 'derived' as const,
}))

export const ACHIEVEMENT_CATALOG: readonly AchievementDef[] = [...EARLY_ACHIEVEMENTS, ...STREAK_ACHIEVEMENTS]

export interface AchievementStats {
  /** Entrenos completados (`user_stats.total_sessions`). */
  totalWorkouts: number
  /** Mejor racha semanal (`user_stats.workout_streak_best`). */
  bestWeeklyStreak: number
}

function metricValue(def: AchievementDef, stats: AchievementStats): number {
  const raw = def.metric === 'workouts' ? stats.totalWorkouts : stats.bestWeeklyStreak
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
}

/** Keys persistidas que las stats ya cumplen, en orden de catálogo. */
export function evaluateEarlyAchievements(stats: AchievementStats): PersistedAchievementKey[] {
  return EARLY_ACHIEVEMENTS
    .filter(def => metricValue(def, stats) >= def.target)
    .map(def => def.key as PersistedAchievementKey)
}

export interface AchievementItem {
  key: AchievementKey
  icon: string
  unlocked: boolean
  /** Cuándo se desbloqueó, si hay fila (ISO/PB). */
  unlockedAt: string | null
  /** Valor actual acotado al objetivo, para la barra «2 / 3». */
  progress: number
  target: number
  metric: AchievementMetric
}

/**
 * Lista de la pantalla: catálogo + estado. Un logro cuenta como conseguido si
 * hay fila desbloqueada O las stats ya lo cumplen (el hook del servidor puede
 * ir un entreno por detrás, y a quien ya lo hizo no se le enseña «bloqueado»).
 *
 * Orden: conseguidos primero (más recientes antes si hay fecha), después los
 * pendientes por cercanía al objetivo y, a igualdad, por catálogo.
 */
export function buildAchievementList(
  stats: AchievementStats,
  unlockedAtByKey: ReadonlyMap<string, string | null> | Record<string, string | null> = {},
): AchievementItem[] {
  const lookup = (key: string): string | null | undefined =>
    unlockedAtByKey instanceof Map ? unlockedAtByKey.get(key) : (unlockedAtByKey as Record<string, string | null>)[key]
  const hasRow = (key: string) =>
    unlockedAtByKey instanceof Map ? unlockedAtByKey.has(key) : Object.prototype.hasOwnProperty.call(unlockedAtByKey, key)

  const items = ACHIEVEMENT_CATALOG.map((def, index) => {
    const value = metricValue(def, stats)
    const unlocked = hasRow(def.key) || value >= def.target
    return {
      index,
      item: {
        key: def.key,
        icon: def.icon,
        unlocked,
        unlockedAt: hasRow(def.key) ? (lookup(def.key) ?? null) : null,
        progress: unlocked ? def.target : Math.min(value, def.target),
        target: def.target,
        metric: def.metric,
      } as AchievementItem,
    }
  })

  items.sort((a, b) => {
    if (a.item.unlocked !== b.item.unlocked) return a.item.unlocked ? -1 : 1
    if (a.item.unlocked) {
      const da = a.item.unlockedAt ?? ''
      const db = b.item.unlockedAt ?? ''
      if (da !== db) return da > db ? -1 : 1
      return a.index - b.index
    }
    const ra = a.item.progress / a.item.target
    const rb = b.item.progress / b.item.target
    if (ra !== rb) return rb - ra
    return a.index - b.index
  })
  return items.map(x => x.item)
}

export function achievementCounts(items: readonly AchievementItem[]): { unlocked: number; total: number } {
  return { unlocked: items.filter(i => i.unlocked).length, total: items.length }
}
