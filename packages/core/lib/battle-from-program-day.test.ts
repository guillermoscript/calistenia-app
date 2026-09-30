import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Exercise } from '../types'
import {
  BATTLE_DAY_MAX_EXERCISES,
  battleConfigFromProgramDay,
  parseRestSeconds,
  type BattleFromDayResult,
} from './battle-from-program-day'
import { validateBattleConfiguration } from './battle'

// La copia del servidor: es lo que decide si una batalla se puede crear.
// Es CommonJS del JSVM de PocketBase y el paquete es ESM: se evalúa como módulo CJS.
const serverModule: { exports: { validateConfiguration: (config: unknown) => string[] } } = { exports: {} as never }
new Function('module', 'exports', readFileSync(resolve(__dirname, '../../../pb_hooks/utils/battles/state.js'), 'utf8'))(
  serverModule, serverModule.exports,
)
const server = serverModule.exports

function ex(id: string, over: Partial<Exercise> = {}): Exercise {
  return {
    id, name: id, sets: 3, reps: '10', rest: 60, muscles: '', note: '', youtube: '', priority: 'med', ...over,
  }
}

function ok(result: BattleFromDayResult) {
  if (!result.ok) throw new Error(`no convertible: ${result.reason}`)
  // Toda salida correcta tiene que pasar las dos validaciones.
  expect(server.validateConfiguration(result.config)).toEqual([])
  expect(validateBattleConfiguration(result.config)).toEqual([])
  return result
}

describe('battleConfigFromProgramDay', () => {
  it('excluye calentamiento y vuelta a la calma y respeta el orden', () => {
    const r = ok(battleConfigFromProgramDay({
      exercises: [
        ex('w', { section: 'warmup' }), ex('a'), ex('b', { section: 'main' }), ex('c', { section: 'cooldown' }),
      ],
    }))
    expect(r.config.exercises.map(e => e.exercise_id)).toEqual(['a', 'b'])
    expect(r.config.exercises.map(e => e.position)).toEqual([0, 1])
    expect(r.config.workout_template_id).toBe('program_day')
  })

  it('deja los supersets consecutivos', () => {
    const r = ok(battleConfigFromProgramDay({
      exercises: [ex('a', { supersetGroup: 'S1' }), ex('b'), ex('c', { supersetGroup: 'S1' })],
    }))
    expect(r.config.exercises.map(e => e.exercise_id)).toEqual(['a', 'c', 'b'])
    expect(r.meta[1].supersetGroup).toBe('S1')
  })

  describe('rondas', () => {
    it('usa las series comunes', () => {
      expect(ok(battleConfigFromProgramDay({ exercises: [ex('a', { sets: 4 }), ex('b', { sets: 4 })] })).config.rounds).toBe(4)
    })

    it('con series distintas usa la menor y lo avisa', () => {
      const r = ok(battleConfigFromProgramDay({ exercises: [ex('a', { sets: 4 }), ex('b', { sets: 3 })] }))
      expect(r.config.rounds).toBe(3)
      expect(r.notes).toContainEqual({ code: 'rounds_flattened', min: 3, max: 4 })
    })

    it('las series no numéricas cuentan como 3', () => {
      const r = ok(battleConfigFromProgramDay({ exercises: [ex('a', { sets: 'múltiples' }), ex('b', { sets: 'intentos' })] }))
      expect(r.config.rounds).toBe(3)
      expect(r.notes).toContainEqual({ code: 'non_numeric_sets', exerciseIds: ['a', 'b'] })
    })

    it('opts.rounds manda y se recorta a 1-10', () => {
      const day = { exercises: [ex('a', { sets: 4 })] }
      expect(ok(battleConfigFromProgramDay(day, { rounds: 6 })).config.rounds).toBe(6)
      expect(ok(battleConfigFromProgramDay(day, { rounds: 99 })).config.rounds).toBe(10)
      expect(ok(battleConfigFromProgramDay(day, { rounds: 0 })).config.rounds).toBe(1)
      expect(ok(battleConfigFromProgramDay(day, { rounds: 6 })).dayRounds).toBe(4)
    })
  })

  describe('objetivo', () => {
    const target = (over: Partial<Exercise>) => {
      const r = ok(battleConfigFromProgramDay({ exercises: [ex('a', over)] }))
      return { t: r.config.exercises[0].target, m: r.meta[0], r }
    }

    it('rango de reps → límite bajo', () => {
      const { t, m } = target({ reps: '8-10' })
      expect(t).toEqual({ kind: 'reps', value: 8 })
      expect(m.fromRange).toBe(true)
      expect(m.defaulted).toBe(false)
    })

    it('c/pierna y por lado conservan el número y marcan el lado', () => {
      expect(target({ reps: '8-10 c/pierna' })).toMatchObject({ t: { kind: 'reps', value: 8 }, m: { perSide: 'leg' } })
      expect(target({ reps: '6 por lado' })).toMatchObject({ t: { value: 6 }, m: { perSide: 'side' } })
      expect(target({ reps: '5 c/lado' }).m.perSide).toBe('side')
      expect(target({ reps: '10' }).m.perSide).toBeNull()
    })

    it('un ejercicio por tiempo va en segundos', () => {
      expect(target({ reps: '20-30s', isTimer: true, timerSeconds: 30 }).t).toEqual({ kind: 'seconds', value: 30 })
    })

    it('por tiempo sin timerSeconds lee los segundos del texto o usa 30', () => {
      expect(target({ reps: '45s', isTimer: true }).t).toEqual({ kind: 'seconds', value: 45 })
      expect(target({ reps: '20-30 seg' }).t).toEqual({ kind: 'seconds', value: 20 })
      const d = target({ reps: '', isTimer: true })
      expect(d.t).toEqual({ kind: 'seconds', value: 30 })
      expect(d.m.defaulted).toBe(true)
    })

    it('reps ilegibles → 10 y marcado como editable', () => {
      const { t, m, r } = target({ reps: 'hasta el fallo' })
      expect(t).toEqual({ kind: 'reps', value: 10 })
      expect(m.defaulted).toBe(true)
      expect(r.notes).toContainEqual({ code: 'targets_defaulted', exerciseIds: ['a'] })
    })

    it('recorta a los máximos del servidor', () => {
      expect(target({ reps: '500' }).t.value).toBe(200)
      expect(target({ reps: '', isTimer: true, timerSeconds: 900 }).t.value).toBe(600)
    })
  })

  describe('descanso', () => {
    it('usa el del programa y lo limita a 120 s', () => {
      const r = ok(battleConfigFromProgramDay({ exercises: [ex('a', { rest: 90 }), ex('b', { rest: 180 }), ex('c', { rest: 0 })] }))
      expect(r.config.exercises.map(e => e.rest_seconds)).toEqual([90, 120, 0])
      expect(r.notes).toContainEqual({ code: 'rest_capped', exerciseIds: ['b'] })
    })

    it('entiende los formatos de texto', () => {
      expect(parseRestSeconds('90s')).toBe(90)
      expect(parseRestSeconds('90 seg')).toBe(90)
      expect(parseRestSeconds('2 min')).toBe(120)
      expect(parseRestSeconds('1:30')).toBe(90)
      expect(parseRestSeconds(75)).toBe(75)
      expect(parseRestSeconds('')).toBe(0)
      expect(parseRestSeconds(undefined)).toBe(0)
      expect(parseRestSeconds(-5)).toBe(0)
    })
  })

  describe('días no convertibles', () => {
    it.each(['cardio', 'yoga', 'rest'] as const)('%s', type => {
      expect(battleConfigFromProgramDay({ type, exercises: [ex('a')] })).toEqual({ ok: false, reason: type })
    })

    it('sin ejercicios de fuerza', () => {
      expect(battleConfigFromProgramDay({ exercises: [] })).toEqual({ ok: false, reason: 'no_strength_exercises' })
      expect(battleConfigFromProgramDay({
        exercises: [ex('w', { section: 'warmup' }), ex('c', { section: 'cooldown' })],
      })).toEqual({ ok: false, reason: 'no_strength_exercises' })
    })
  })

  describe('límites del servidor', () => {
    it('trunca a 8 ejercicios y lo dice', () => {
      const exercises = Array.from({ length: 11 }, (_, i) => ex(`e${i}`))
      const r = ok(battleConfigFromProgramDay({ exercises }))
      expect(r.config.exercises).toHaveLength(BATTLE_DAY_MAX_EXERCISES)
      expect(r.notes).toContainEqual({ code: 'truncated', dropped: 3, max: 8 })
    })

    it('quita ids repetidos, que el servidor rechaza', () => {
      const r = ok(battleConfigFromProgramDay({ exercises: [ex('a'), ex('b'), ex('a')] }))
      expect(r.config.exercises.map(e => e.exercise_id)).toEqual(['a', 'b'])
      expect(r.notes).toContainEqual({ code: 'duplicates_removed', exerciseIds: ['a'] })
    })
  })

  describe('días reales de programs/*.json', () => {
    // Misma traducción que hace la siembra: `priority` warmup/cooldown → `section`.
    interface SeedExercise {
      exercise_id: string; name: { es: string }; sets: number | string; reps: string
      rest_seconds: number; priority: string; is_timer?: boolean; timer_seconds?: number
    }
    function toDay(day: { exercises: SeedExercise[] }) {
      return {
        exercises: day.exercises.map((e): Exercise => ({
          id: e.exercise_id, name: e.name.es, sets: e.sets, reps: e.reps, rest: e.rest_seconds,
          muscles: '', note: '', youtube: '', priority: 'med',
          isTimer: e.is_timer, timerSeconds: e.timer_seconds,
          section: e.priority === 'warmup' ? 'warmup' : e.priority === 'cooldown' ? 'cooldown' : 'main',
        })),
      }
    }
    const readProgram = (name: string) =>
      JSON.parse(readFileSync(resolve(__dirname, `../../../programs/${name}.json`), 'utf8'))
    function realDay(program: string, dayId: string) {
      const day = readProgram(program).phases[0].days.find((d: { day_id: string }) => d.day_id === dayId)
      return toDay(day)
    }

    it('principiante-fundamentos · lunes', () => {
      const r = ok(battleConfigFromProgramDay(realDay('principiante-fundamentos', 'lun')))
      expect(r.config.rounds).toBe(3)
      expect(r.config.exercises.map(e => [e.exercise_id, e.target.kind, e.target.value, e.rest_seconds])).toEqual([
        ['knee_push_up', 'reps', 5, 90],
        ['wide_pushup', 'reps', 6, 75],
        ['bodyweight_squatting_row', 'reps', 8, 60],
        ['pull_apart', 'reps', 15, 45],
        ['plank', 'seconds', 30, 60],
        ['superman', 'reps', 8, 60],
      ])
      expect(r.notes).toContainEqual({ code: 'rounds_flattened', min: 3, max: 4 })
    })

    it('avanzado-fuerza-total · miércoles (c/lado)', () => {
      const r = ok(battleConfigFromProgramDay(realDay('avanzado-fuerza-total', 'mie')))
      expect(r.config.rounds).toBe(2)
      expect(r.config.exercises[0]).toMatchObject({ exercise_id: 'pistol_free', target: { kind: 'reps', value: 3 }, rest_seconds: 120 })
      expect(r.meta.map(m => m.perSide)).toEqual(['side', null, 'side', 'side', 'side'])
    })

    it('intermedio-hipertrofia · martes (tiempos en «seg»)', () => {
      const r = ok(battleConfigFromProgramDay(realDay('intermedio-hipertrofia', 'mar')))
      expect(r.config.exercises[0]).toMatchObject({ exercise_id: 'skin_the_cat', target: { kind: 'seconds', value: 20 } })
    })

    it('todos los días de todos los programas dan una configuración válida o un motivo', () => {
      const dir = resolve(__dirname, '../../../programs')
      let converted = 0
      for (const f of readdirSync(dir).filter(n => n.endsWith('.json'))) {
        for (const phase of readProgram(f.replace('.json', '')).phases) {
          for (const d of phase.days) {
            const res = battleConfigFromProgramDay(toDay(d))
            if (res.ok) { ok(res); converted++ }
          }
        }
      }
      expect(converted).toBeGreaterThan(100)
    })
  })
})
