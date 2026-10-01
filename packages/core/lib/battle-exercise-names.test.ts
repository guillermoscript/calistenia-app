import { describe, expect, it } from 'vitest'
import { buildCatalogIndex } from './catalogIndex'
import { battleExerciseNamesFrom } from './battle-exercise-names'
import { battleExerciseLabel } from '../data/battle-presets'
import { BATTLE_LIMITS } from './battle'

const index = buildCatalogIndex({
  categories: {
    push: {
      exercises: [
        { id: 'pushup_std', name: { es: 'Flexiones', en: 'Push-ups' } },
        { id: 'solo_es', name: { es: 'Solo español' } },
      ],
    },
  },
})

describe('battleExerciseNamesFrom', () => {
  it('usa el nombre {es,en} del catálogo cuando el id está', () => {
    expect(battleExerciseNamesFrom([{ exerciseId: 'pushup_std', displayName: 'Mi nombre' }], 'es', index))
      .toEqual({ pushup_std: { es: 'Flexiones', en: 'Push-ups' } })
  })

  it('no inventa el idioma que el catálogo no tiene', () => {
    expect(battleExerciseNamesFrom([{ exerciseId: 'solo_es' }], 'en', index))
      .toEqual({ solo_es: { es: 'Solo español' } })
  })

  it('un slot cuyo nombre de programa está en el catálogo se resuelve a él', () => {
    expect(battleExerciseNamesFrom([{ exerciseId: 'lun_1_2', displayName: 'Flexiones' }], 'es', index))
      .toEqual({ lun_1_2: { es: 'Flexiones', en: 'Push-ups' } })
  })

  it('un slot desconocido cae al nombre del programa en el idioma del creador', () => {
    expect(battleExerciseNamesFrom([{ exerciseId: 'lun_1_3', displayName: 'Planche raro' }], 'en-US', index))
      .toEqual({ lun_1_3: { en: 'Planche raro' } })
  })

  it('sin índice usa el nombre del programa', () => {
    expect(battleExerciseNamesFrom([{ exerciseId: 'x', displayName: 'Cosa' }], 'es', null)).toEqual({ x: { es: 'Cosa' } })
  })

  it('omite lo que no tiene nombre y corta a 80 caracteres', () => {
    const long = 'a'.repeat(200)
    const r = battleExerciseNamesFrom([{ exerciseId: 'a' }, { exerciseId: 'b', displayName: long }], 'es', null)
    expect(r.a).toBeUndefined()
    expect(r.b.es).toHaveLength(BATTLE_LIMITS.maxExerciseNameLength)
  })

  it('el invitado lo lee con battleExerciseLabel en su idioma', () => {
    const exercise_names = battleExerciseNamesFrom([{ exerciseId: 'lun_1_3', displayName: 'Planche raro' }], 'es', index)
    expect(battleExerciseLabel({ workout_template_id: 'program_day', exercise_names }, 'lun_1_3', 'en')).toBe('Planche raro')
  })
})
