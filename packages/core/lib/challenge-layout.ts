/**
 * Qué forma tiene un reto, y por tanto qué layout le toca (#383).
 *
 * Los retos son de dos formas distintas y el detalle les daba un único layout:
 *
 * - **Con meta** (`goal > 0`) — compites contra un número. Lo que quieres ver es
 *   cuánto te falta, así que el progreso es el héroe y la clasificación baja.
 * - **Sin meta** — compites contra personas. Lo que quieres ver es en qué puesto
 *   vas, así que la clasificación *es* la pantalla.
 *
 * Vive en core y no duplicado en cada app a propósito: el criterio de aceptación
 * del issue pide que las dos ramas se decidan igual en web y en nativo.
 */
import type { Challenge } from '../types'

export type ChallengeLayout = 'express' | 'goal' | 'ranking'

/**
 * Los retos express (#313) son una tercera forma: no compiten contra una meta
 * acumulada sino contra `daily_target` durante `duration_days`, y ya tienen su
 * propio layout de progreso diario. Se comprueban PRIMERO para que uno que
 * además traiga `goal` no caiga por error en la rama de meta.
 */
export function getChallengeLayout(challenge: Pick<Challenge, 'goal' | 'type'> | null | undefined): ChallengeLayout {
  if (!challenge) return 'ranking'
  if (challenge.type === 'express') return 'express'
  return (challenge.goal ?? 0) > 0 ? 'goal' : 'ranking'
}

export interface GoalProgress {
  /** 0–100, acotado: pasarse de la meta no desborda la barra. */
  pct: number
  /** Lo que falta para la meta; 0 cuando ya se alcanzó (nunca negativo). */
  remaining: number
  reached: boolean
}

export function getGoalProgress(value: number, goal: number | undefined | null): GoalProgress {
  const target = goal ?? 0
  // Sin meta válida no hay progreso que enseñar: 0 % y nada pendiente, en vez de
  // una división por cero que pintaría NaN en la barra.
  if (target <= 0) return { pct: 0, remaining: 0, reached: false }
  const done = Number.isFinite(value) && value > 0 ? value : 0
  return {
    pct: Math.min(100, Math.round((done / target) * 100)),
    remaining: Math.max(0, target - done),
    reached: done >= target,
  }
}
