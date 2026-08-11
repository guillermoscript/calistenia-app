import { describe, it, expect } from 'vitest'
import { BATTLE_PRESETS, battleExerciseName, battleRoundTargets, findBattlePreset } from './battle-presets'
import { validateBattleConfiguration } from '../lib/battle'

describe('BATTLE_PRESETS', () => {
  // Un preset inválido no falla al escribirlo: falla en el móvil del usuario, con un
  // 400 del guard de `pb_hooks` justo cuando intenta crear la batalla.
  it('every preset passes the same validation the server applies', () => {
    for (const preset of BATTLE_PRESETS) {
      expect(validateBattleConfiguration(preset.config), preset.id).toEqual([])
    }
  })

  it('pins workout_template_id to the preset id', () => {
    // Los ids se guardan dentro de `battles.config`: si divergen, una batalla vieja ya
    // no encuentra su preset y se queda sin nombres de ejercicio.
    for (const preset of BATTLE_PRESETS) {
      expect(preset.config.workout_template_id).toBe(preset.id)
    }
  })

  it('names every exercise it ships', () => {
    for (const preset of BATTLE_PRESETS) {
      for (const exercise of preset.config.exercises) {
        expect(preset.exerciseNames[exercise.exercise_id], `${preset.id}/${exercise.exercise_id}`)
          .toBeDefined()
      }
    }
  })

  it('has unique ids', () => {
    const ids = BATTLE_PRESETS.map(preset => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('battleExerciseName', () => {
  it('resolves the localized name', () => {
    expect(battleExerciseName('battle_sprint_3', 'push_ups', 'es')).toBe('Flexiones')
    expect(battleExerciseName('battle_sprint_3', 'push_ups', 'en-US')).toBe('Push-ups')
  })

  it('prettifies an unknown exercise instead of showing the raw id', () => {
    // Una batalla creada por un cliente más nuevo puede traer un ejercicio que este
    // build no conoce; la pantalla tiene que seguir siendo legible.
    expect(battleExerciseName('battle_sprint_3', 'archer_push_ups', 'es')).toBe('Archer Push Ups')
    expect(battleExerciseName('preset_que_no_existe', 'push_ups', 'es')).toBe('Push Ups')
  })
})

describe('battleRoundTargets', () => {
  it('adds reps and seconds separately', () => {
    // El contrato no convierte segundos en reps: no hay tipo de cambio entre
    // ejercicios distintos, así que se reportan los dos agregados por separado.
    const core = findBattlePreset('battle_core_5')!
    expect(battleRoundTargets(core.config)).toEqual({ reps: 35, seconds: 30 })
  })
})
