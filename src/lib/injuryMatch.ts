/**
 * Heuristic injury-risk match for exercises.
 *
 * Calisthenics exercises don't carry structured joint metadata, so we match
 * lowercase keyword tokens against the exercise name. Intentionally
 * conservative: keywords are specific enough that false positives are rare
 * on the app's current catalog. Returns the subset of the user's injuries
 * that the exercise plausibly stresses.
 */

import type { InjuryId } from '../components/onboarding/StepHealth'

const INJURY_KEYWORDS: Record<Exclude<InjuryId, 'other'>, string[]> = {
  shoulder: [
    'press', 'overhead', 'ohp', 'push-up', 'push up', 'flexión', 'flexion',
    'dip', 'pull-up', 'pull up', 'dominada', 'muscle-up', 'muscle up',
    'handstand', 'parada de manos', 'pino', 'plank', 'plancha', 'row', 'remo',
  ],
  wrist: [
    'push-up', 'push up', 'flexión', 'flexion', 'handstand', 'parada de manos',
    'pino', 'plank', 'plancha', 'dip', 'press',
  ],
  elbow: [
    'push-up', 'push up', 'flexión', 'flexion', 'dip', 'pull-up', 'pull up',
    'dominada', 'curl', 'extension', 'extensión', 'tricep',
  ],
  knee: [
    'squat', 'sentadilla', 'lunge', 'zancada', 'pistol', 'jump', 'salto',
    'step up', 'subida', 'burpee', 'split squat',
  ],
  ankle: [
    'jump', 'salto', 'burpee', 'plyom', 'calf', 'gemelo', 'sprint', 'hop',
    'skip',
  ],
  lower_back: [
    'deadlift', 'peso muerto', 'l-sit', 'l sit', 'dragon', 'leg raise',
    'elevación de pierna', 'elevacion pierna', 'hollow', 'bridge', 'puente',
    'back extension', 'extensión de espalda', 'good morning', 'hyperextension',
    'toes to bar', 'v-up',
  ],
}

export function exerciseInjuryFlags(
  exerciseName: string,
  userInjuries: InjuryId[],
): InjuryId[] {
  if (!userInjuries.length) return []
  const haystack = exerciseName.toLowerCase()
  const flags: InjuryId[] = []
  for (const inj of userInjuries) {
    if (inj === 'other') continue
    const keywords = INJURY_KEYWORDS[inj]
    if (keywords.some(k => haystack.includes(k))) flags.push(inj)
  }
  return flags
}
