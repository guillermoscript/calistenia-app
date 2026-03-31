import type { DayType, Exercise } from '../types'

const MUSCLE_MAP: Record<string, DayType> = {
  // Push
  chest: 'push', pectoral: 'push', pecho: 'push', shoulder: 'push', hombro: 'push',
  deltoid: 'push', deltoide: 'push', triceps: 'push', tríceps: 'push',
  // Pull
  back: 'pull', espalda: 'pull', lat: 'pull', dorsal: 'pull', bicep: 'pull',
  bíceps: 'pull', forearm: 'pull', antebrazo: 'pull', trapez: 'pull', trapecio: 'pull',
  // Legs
  quad: 'legs', cuádriceps: 'legs', cuadriceps: 'legs', hamstring: 'legs',
  isquio: 'legs', glute: 'legs', glúteo: 'legs', calf: 'legs', pantorrilla: 'legs',
  leg: 'legs', pierna: 'legs', soleo: 'legs', tobillo: 'legs',
  // Lumbar / core
  core: 'lumbar', lumbar: 'lumbar', abs: 'lumbar', oblique: 'lumbar',
  oblicuo: 'lumbar', columna: 'lumbar', abdominal: 'lumbar',
  // Cardio
  cardio: 'cardio', aerobic: 'cardio', aeróbico: 'cardio',
}

export function detectDayType(exercises: Exercise[]): DayType {
  const counts: Record<DayType, number> = {
    push: 0, pull: 0, legs: 0, lumbar: 0, full: 0, cardio: 0, rest: 0,
  }

  for (const ex of exercises) {
    if (!ex.muscles) continue
    const tokens = ex.muscles.toLowerCase().split(/[,\s/]+/)
    for (const token of tokens) {
      const trimmed = token.trim()
      if (!trimmed) continue
      // Check each keyword against the token
      for (const [keyword, dayType] of Object.entries(MUSCLE_MAP)) {
        if (trimmed.includes(keyword)) {
          counts[dayType]++
          break
        }
      }
    }
  }

  // Find dominant type (exclude full, rest, cardio ties differently)
  let best: DayType = 'full'
  let bestCount = 0
  for (const dt of ['push', 'pull', 'legs', 'lumbar', 'cardio'] as DayType[]) {
    if (counts[dt] > bestCount) {
      bestCount = counts[dt]
      best = dt
    }
  }

  return bestCount > 0 ? best : 'full'
}
