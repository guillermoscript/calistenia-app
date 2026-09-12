/**
 * Validación de los pasos del asistente de programas (#610).
 *
 * Antes de #610 `validate(step)` solo cubría los pasos 1 y 2, así que se podía
 * guardar y publicar un programa sin un solo ejercicio, con los siete días en
 * descanso o con rangos de semanas solapados. Las reglas viven ahora en
 * `collectStepErrors`, que es pura: el hook no se renderiza (core corre en
 * Node), y como i18next tampoco está inicializado aquí, se afirma sobre las
 * claves i18n y no sobre el texto traducido.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/pocketbase', () => ({
  pb: { filter: vi.fn(), collection: vi.fn(() => ({})), authStore: { record: null } },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

import {
  collectStepErrors,
  type EditorDay,
  type EditorExercise,
  type ProgramEditorState,
} from './useProgramEditor'
import esTranslations from '../locales/es/translation.json'
import enTranslations from '../locales/en/translation.json'

const exercise = (over: Partial<EditorExercise> = {}): EditorExercise => ({
  exerciseId: 'ex_1',
  name: 'Flexiones',
  sets: 3,
  reps: '12',
  rest: 60,
  muscles: '',
  note: '',
  youtube: '',
  priority: 'med',
  isTimer: false,
  timerSeconds: 0,
  section: 'main',
  ...over,
})

const day = (over: Partial<EditorDay> = {}): EditorDay => ({
  dayId: 'lun',
  dayName: 'Lunes',
  focus: 'Empuje',
  type: 'push',
  color: '#c8f542',
  exercises: [exercise()],
  ...over,
})

/**
 * `info` completo con los valores por defecto del editor.
 *
 * `ProgramEditorInfo` creció con la visibilidad (#603), los campos de catálogo
 * (#613) y la portada (#618). Los casos de abajo solo necesitan tocar dos o
 * tres campos, así que parten de esta base en vez de repetir los catorce.
 */
const baseInfo = (over: Partial<ProgramEditorState['info']> = {}): ProgramEditorState['info'] => ({
  name: '',
  description: '',
  durationWeeks: 26,
  isOfficial: false,
  visibility: 'private',
  difficulty: 'beginner',
  goalType: '',
  skill: '',
  intensity: '',
  daysPerWeek: null,
  equipmentRequired: [],
  contraindications: [],
  instructions: '',
  coverImage: '',
  coverUrl: null,
  coverFile: null,
  coverRemoved: false,
  ...over,
})

/** Programa válido de 8 semanas: 2 fases, un día de entreno y uno de descanso. */
const validState = (over: Partial<ProgramEditorState> = {}): ProgramEditorState => ({
  programId: null,
  step: 1,
  info: baseInfo({ name: 'Mi programa', durationWeeks: 8 }),
  phases: [
    { name: 'Base', weeks: '1-4', color: '#c8f542', bgColor: '' },
    { name: 'Fuerza', weeks: '5-8', color: '#42c8f5', bgColor: '' },
  ],
  days: {
    '0_lun': day(),
    '0_dom': day({ dayId: 'dom', dayName: 'Domingo', type: 'rest', exercises: [] }),
    '1_lun': day(),
    '1_dom': day({ dayId: 'dom', dayName: 'Domingo', type: 'rest', exercises: [] }),
  },
  isDirty: false,
  isSaving: false,
  error: null,
  ...over,
})

const keys = (step: number, state: ProgramEditorState) =>
  collectStepErrors(step, state).map(e => e.key)

describe('collectStepErrors', () => {
  it('no marca nada en un programa válido, en ninguno de los cuatro pasos', () => {
    const state = validState()
    for (const step of [1, 2, 3, 4]) {
      expect(collectStepErrors(step, state)).toEqual([])
    }
  })

  describe('paso 1 — información', () => {
    it('exige nombre', () => {
      const state = validState()
      expect(keys(1, { ...state, info: { ...state.info, name: '   ' } })).toEqual([
        'programEditor.nameRequired',
      ])
    })

    it('exige al menos una semana', () => {
      const state = validState()
      expect(keys(1, { ...state, info: { ...state.info, durationWeeks: 0 } })).toEqual([
        'programEditor.minOneWeek',
      ])
    })
  })

  describe('paso 2 — rangos de semanas', () => {
    it('rechaza fases solapadas («1-6» y «4-8», el caso de la issue)', () => {
      const state = validState({
        info: { ...validState().info, durationWeeks: 8 },
        phases: [
          { name: 'Base', weeks: '1-6', color: '', bgColor: '' },
          { name: 'Fuerza', weeks: '4-8', color: '', bgColor: '' },
        ],
      })
      const errors = collectStepErrors(2, state)
      expect(errors.map(e => e.key)).toEqual(['programEditor.phaseWeeksNotContiguous'])
      // La fase 2 tenía que empezar en la 7, que es donde acabó la 1.
      expect(errors[0].params).toEqual({ n: 2, expected: 7, found: 4 })
    })

    it('rechaza un hueco entre fases', () => {
      const state = validState({
        phases: [
          { name: 'Base', weeks: '1-4', color: '', bgColor: '' },
          { name: 'Fuerza', weeks: '6-8', color: '', bgColor: '' },
        ],
      })
      const errors = collectStepErrors(2, state)
      expect(errors.map(e => e.key)).toEqual(['programEditor.phaseWeeksNotContiguous'])
      expect(errors[0].params).toEqual({ n: 2, expected: 5, found: 6 })
    })

    it('exige que la primera fase empiece en la semana 1', () => {
      const state = validState({
        phases: [
          { name: 'Base', weeks: '2-4', color: '', bgColor: '' },
          { name: 'Fuerza', weeks: '5-8', color: '', bgColor: '' },
        ],
      })
      const errors = collectStepErrors(2, state)
      expect(errors.map(e => e.key)).toEqual(['programEditor.phaseWeeksNotContiguous'])
      expect(errors[0].params).toEqual({ n: 1, expected: 1, found: 2 })
    })

    it('exige que las fases cubran la duración del programa', () => {
      const state = validState({
        info: { ...validState().info, durationWeeks: 8 },
        phases: [
          { name: 'Base', weeks: '1-4', color: '', bgColor: '' },
          { name: 'Fuerza', weeks: '5-6', color: '', bgColor: '' },
        ],
      })
      const errors = collectStepErrors(2, state)
      expect(errors.map(e => e.key)).toEqual(['programEditor.phaseWeeksMustCoverDuration'])
      expect(errors[0].params).toEqual({ total: 8, covered: 6 })
    })

    it('rechaza un rango ilegible', () => {
      const state = validState({
        phases: [
          { name: 'Base', weeks: 'primeras semanas', color: '', bgColor: '' },
          { name: 'Fuerza', weeks: '5-8', color: '', bgColor: '' },
        ],
      })
      // Solo el rango roto: la cobertura no se juzga si los rangos no se leen.
      expect(keys(2, state)).toEqual(['programEditor.phaseWeeksInvalid'])
    })

    it('acepta una fase de una sola semana escrita sin guion', () => {
      const state = validState({
        info: { ...validState().info, durationWeeks: 5 },
        phases: [
          { name: 'Base', weeks: '1-4', color: '', bgColor: '' },
          { name: 'Descarga', weeks: '5', color: '', bgColor: '' },
        ],
      })
      expect(collectStepErrors(2, state)).toEqual([])
    })

    it('sigue exigiendo nombre y semanas en cada fase', () => {
      const state = validState({
        phases: [
          { name: '  ', weeks: '1-4', color: '', bgColor: '' },
          { name: 'Fuerza', weeks: '  ', color: '', bgColor: '' },
        ],
      })
      expect(keys(2, state)).toEqual([
        'programEditor.phaseNeedsName',
        'programEditor.phaseNeedsWeeks',
      ])
    })
  })

  describe('paso 3 — días de entrenamiento', () => {
    it('rechaza una fase entera en descanso', () => {
      const state = validState()
      const errors = collectStepErrors(3, {
        ...state,
        days: { ...state.days, '0_lun': day({ type: 'rest', exercises: [] }) },
      })
      expect(errors.map(e => e.key)).toEqual(['programEditor.phaseNeedsTrainingDay'])
      expect(errors[0].params).toEqual({ n: 1, name: 'Base' })
    })

    it('un día de cardio cuenta como día de entrenamiento', () => {
      const state = validState()
      expect(
        collectStepErrors(3, {
          ...state,
          days: { ...state.days, '0_lun': day({ type: 'cardio', exercises: [] }) },
        }),
      ).toEqual([])
    })
  })

  describe('paso 4 — ejercicios', () => {
    const withDay = (over: Partial<EditorDay>) => {
      const state = validState()
      return { ...state, days: { ...state.days, '0_lun': day(over) } }
    }

    it('exige al menos un ejercicio en la sección principal', () => {
      const errors = collectStepErrors(4, withDay({ exercises: [] }))
      expect(errors.map(e => e.key)).toEqual(['programEditor.dayNeedsExercise'])
      expect(errors[0].params).toEqual({ n: 1, day: 'Lunes' })
    })

    it('un día solo con calentamiento y vuelta a la calma no vale', () => {
      const state = withDay({
        exercises: [exercise({ section: 'warmup' }), exercise({ section: 'cooldown' })],
      })
      expect(keys(4, state)).toEqual(['programEditor.dayNeedsExercise'])
    })

    it('un ejercicio sin section cuenta como principal (programas antiguos)', () => {
      const state = withDay({ exercises: [exercise({ section: undefined })] })
      expect(collectStepErrors(4, state)).toEqual([])
    })

    it('no exige ejercicios a un día de descanso ni a uno de cardio', () => {
      expect(collectStepErrors(4, withDay({ type: 'rest', exercises: [] }))).toEqual([])
      expect(collectStepErrors(4, withDay({ type: 'cardio', exercises: [] }))).toEqual([])
    })

    it('rechaza sets que no sean un entero ≥ 1', () => {
      for (const sets of ['muchas', '', 0, -2, 2.5]) {
        expect(keys(4, withDay({ exercises: [exercise({ sets })] }))).toEqual([
          'programEditor.exerciseSetsInvalid',
        ])
      }
    })

    it('acepta sets como cadena numérica (es lo que guarda el input)', () => {
      expect(collectStepErrors(4, withDay({ exercises: [exercise({ sets: '4' })] }))).toEqual([])
    })

    it('rechaza reps en texto libre', () => {
      for (const reps of ['al fallo', 'max', '', '8 a 12']) {
        expect(keys(4, withDay({ exercises: [exercise({ reps })] }))).toEqual([
          'programEditor.exerciseRepsInvalid',
        ])
      }
    })

    it('acepta reps como número o como rango', () => {
      for (const reps of ['12', '8-12']) {
        expect(collectStepErrors(4, withDay({ exercises: [exercise({ reps })] }))).toEqual([])
      }
    })

    it('exige al menos 5 segundos en un ejercicio por tiempo', () => {
      const state = withDay({
        exercises: [exercise({ isTimer: true, timerSeconds: 3, reps: '' })],
      })
      const errors = collectStepErrors(4, state)
      expect(errors.map(e => e.key)).toEqual(['programEditor.exerciseTimerTooShort'])
      expect(errors[0].params).toEqual({ n: 1, day: 'Lunes', exercise: 'Flexiones', min: 5 })
    })

    it('un ejercicio por tiempo válido no pasa por la regla de reps', () => {
      const state = withDay({
        exercises: [exercise({ isTimer: true, timerSeconds: 45, reps: 'al fallo' })],
      })
      expect(collectStepErrors(4, state)).toEqual([])
    })

    it('acumula un error por cada ejercicio roto del día', () => {
      const state = withDay({
        exercises: [exercise({ sets: 'x' }), exercise({ name: 'Dominadas', reps: 'al fallo' })],
      })
      expect(keys(4, state)).toEqual([
        'programEditor.exerciseSetsInvalid',
        'programEditor.exerciseRepsInvalid',
      ])
    })
  })

  it('todas las claves de error existen en es y en en', () => {
    const es = esTranslations as Record<string, string>
    const en = enTranslations as Record<string, string>
    const broken = validState({
      info: baseInfo({ durationWeeks: 0 }),
      phases: [
        { name: 'Base', weeks: '1-6', color: '', bgColor: '' },
        { name: 'Fuerza', weeks: '4-9', color: '', bgColor: '' },
      ],
      days: {
        '0_lun': day({ exercises: [exercise({ sets: 'x', reps: 'al fallo' })] }),
        '0_mar': day({ dayId: 'mar', dayName: 'Martes', exercises: [] }),
        '1_lun': day({ type: 'rest', exercises: [] }),
      },
    })
    const produced = new Set(
      [1, 2, 3, 4].flatMap(step => collectStepErrors(step, broken).map(e => e.key)),
    )
    // La muestra tiene que ejercitar de verdad las reglas nuevas.
    expect(produced.size).toBeGreaterThanOrEqual(6)
    for (const key of produced) {
      expect(es[key], `falta ${key} en es`).toBeTruthy()
      expect(en[key], `falta ${key} en en`).toBeTruthy()
    }
  })
})
