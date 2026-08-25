import { storage } from '../platform'
import { pb } from './pocketbase'
import { CANONICAL_ANALYTICS_EVENTS, emitOnce, trackCanonicalEvent } from './analytics'

/**
 * Emit `program_milestone_completed` once every configured day of the phase has
 * a completion **for this program**.
 *
 * Completion is read from PocketBase scoped by `program` rather than from the
 * progress cache: that cache is deliberately program-agnostic (localStorage is a
 * single global blob and `loadFromPB` also pulls sessions with `program = ""`),
 * so another program's `p1_lun` would satisfy this program's phase 1 — and the
 * marker written below would then suppress the real milestone forever. Cardio
 * days live in `cardio_sessions` and circuit days in `circuit_sessions`, so all
 * three collections are consulted; the local marker keeps the event idempotent
 * across re-renders and both platforms.
 */
export async function emitProgramMilestoneIfCompleted(userId: string, programId: string, workoutKey: string): Promise<void> {
  const match = /^p(\d+)_/.exec(workoutKey)
  if (!match) return
  const phase = Number(match[1])
  const milestoneKey = `calistenia_program_milestone_${userId}_${programId}_${phase}`
  if (storage.getItem(milestoneKey)) return

  const dayPrefix = `p${phase}_`
  try {
    const [exerciseDays, configuredDays, sessions, cardioSessions, circuitSessions] = await Promise.all([
      pb.collection('program_exercises').getFullList({
        filter: pb.filter('program = {:pid} && phase_number = {:phase}', { pid: programId, phase }),
        fields: 'day_id',
        $autoCancel: false,
      }).catch(() => [] as any[]),
      pb.collection('program_day_config').getFullList({
        filter: pb.filter('program = {:pid} && phase_number = {:phase} && day_type != "rest"', { pid: programId, phase }),
        fields: 'day_id,day_type',
        $autoCancel: false,
      }).catch(() => [] as any[]),
      pb.collection('sessions').getFullList({
        filter: pb.filter('user = {:uid} && program = {:pid} && workout_key ~ {:prefix}', { uid: userId, pid: programId, prefix: `${dayPrefix}%` }),
        fields: 'workout_key',
        $autoCancel: false,
      }).catch(() => [] as any[]),
      pb.collection('cardio_sessions').getFullList({
        filter: pb.filter('user = {:uid} && program = {:pid} && program_day_key ~ {:prefix}', { uid: userId, pid: programId, prefix: `${dayPrefix}%` }),
        fields: 'program_day_key',
        $autoCancel: false,
      }).catch(() => [] as any[]),
      // Días de circuito (#640). Un día de circuito con ejercicios entra en
      // `requiredDays` vía program_exercises, así que sin esta lectura era un
      // requisito imposible: el hito de fase no se disparaba NUNCA en un
      // programa que tuviera uno.
      pb.collection('circuit_sessions').getFullList({
        filter: pb.filter('user = {:uid} && program = {:pid} && program_day_key ~ {:prefix}', { uid: userId, pid: programId, prefix: `${dayPrefix}%` }),
        fields: 'program_day_key',
        $autoCancel: false,
      }).catch(() => [] as any[]),
    ])
    const requiredDays = new Set<string>([
      ...exerciseDays.map((record: any) => record.day_id).filter(Boolean),
      ...configuredDays.map((record: any) => record.day_id).filter(Boolean),
    ])
    if (requiredDays.size === 0) return

    // `~` is a LIKE match, where `_` is a single-char wildcard: re-check the
    // prefix exactly before slicing it off.
    const completedDays = new Set<string>(
      [
        ...sessions.map((record: any) => record.workout_key),
        ...cardioSessions.map((record: any) => record.program_day_key),
        ...circuitSessions.map((record: any) => record.program_day_key),
      ]
        .filter((key: unknown): key is string => typeof key === 'string' && key.startsWith(dayPrefix))
        .map((key: string) => key.slice(dayPrefix.length)),
    )
    if (![...requiredDays].every(day => completedDays.has(day))) return

    emitOnce(milestoneKey, () => {
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.programMilestoneCompleted, {
        surface: 'program',
        source: 'workout_completion',
        program_id: programId,
        workout_id: workoutKey,
        milestone_id: `phase_${phase}`,
        result: 'phase_completed',
      })
    })
  } catch {
    // Analytics must never make workout completion fail.
  }
}
