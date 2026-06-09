import type { CircuitDefinition } from '../types'

export interface CircuitPreset {
  id: string
  name: { es: string; en: string }
  description: { es: string; en: string }
  template: Partial<CircuitDefinition>
}

export const CIRCUIT_PRESETS: CircuitPreset[] = [
  {
    id: 'tabata',
    name: { es: 'Tabata', en: 'Tabata' },
    description: { es: '20s trabajo / 10s descanso, 8 rondas', en: '20s work / 10s rest, 8 rounds' },
    template: {
      mode: 'timed',
      rounds: 8,
      workSeconds: 20,
      restSeconds: 10,
      restBetweenExercises: 0,
      restBetweenRounds: 60,
    },
  },
  {
    id: 'emom',
    name: { es: 'EMOM', en: 'EMOM' },
    description: { es: '60s por ejercicio, 4 rondas', en: '60s per exercise, 4 rounds' },
    template: {
      mode: 'timed',
      rounds: 4,
      workSeconds: 60,
      restSeconds: 0,
      restBetweenExercises: 0,
      restBetweenRounds: 60,
    },
  },
  {
    id: 'bodyweight',
    name: { es: 'Circuito Corporal', en: 'Bodyweight Circuit' },
    description: { es: '5 ejercicios, 3 rondas', en: '5 exercises, 3 rounds' },
    template: {
      mode: 'circuit',
      rounds: 3,
      restBetweenExercises: 0,
      restBetweenRounds: 60,
      exercises: [
        { exerciseId: 'burpees', name: { es: 'Burpees', en: 'Burpees' }, reps: '10' },
        { exerciseId: 'mountain_climbers', name: { es: 'Escaladores', en: 'Mountain Climbers' }, reps: '20' },
        { exerciseId: 'jump_squats', name: { es: 'Sentadillas con salto', en: 'Jump Squats' }, reps: '15' },
        { exerciseId: 'push_ups', name: { es: 'Flexiones', en: 'Push-ups' }, reps: '12' },
        { exerciseId: 'plank', name: { es: 'Plancha', en: 'Plank' }, reps: '30s' },
      ],
    },
  },
]
