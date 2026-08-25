import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { WeekDay, Workout } from '@calistenia/core/types'

// Sin backend de i18next las claves salen tal cual; se interpolan los params
// para poder leer "workout.trainAnyway:Miércoles".
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
    i18n: { language: 'es' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

// La página emite `workout_day_viewed` (#636 §3). Solo se sustituye el emisor:
// `plannedSetCount` sigue siendo el real, que es lo que la página le pasa.
const mockDayViewed = vi.hoisted(() => vi.fn())
vi.mock('@calistenia/core/lib/session-funnel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@calistenia/core/lib/session-funnel')>()),
  trackWorkoutDayViewed: mockDayViewed,
}))

const h = vi.hoisted(() => ({
  todayIndex: 1, // lunes
  weekDays: [] as unknown[],
  getWorkout: vi.fn(),
  circuitDayConfigs: {} as Record<string, unknown>,
  activeProgram: null as unknown,
  startCircuit: vi.fn(),
}))

vi.mock('@calistenia/core/lib/dateUtils', () => ({
  localDay: () => h.todayIndex,
  localDate: () => '2026-08-24',
}))

vi.mock('../contexts/WorkoutContext', () => ({
  useWorkoutState: () => ({
    settings: { phase: 1 },
    // #616: la fase ya no sale de settings sino del progreso del programa.
    programProgress: { currentPhase: 1 },
    phases: [{ id: 1, name: 'F1' }],
    weekDays: h.weekDays,
    cardioDayConfigs: {},
    circuitDayConfigs: h.circuitDayConfigs,
    activeProgram: h.activeProgram,
  }),
  useWorkoutActions: () => ({
    logSet: vi.fn(),
    markWorkoutDone: vi.fn(),
    unmarkWorkoutDone: vi.fn(),
    isWorkoutDone: () => false,
    getExerciseLogs: () => [],
    getWorkout: h.getWorkout,
  }),
}))
vi.mock('../contexts/CircuitSessionContext', () => ({ useCircuitSession: () => ({ startCircuit: h.startCircuit }) }))
vi.mock('../contexts/ActiveSessionContext', () => ({ useActiveSession: () => ({ startSession: vi.fn() }) }))
vi.mock('../contexts/AuthContext', () => ({ useAuthState: () => ({ userId: 'u1', userRole: 'user' }) }))
vi.mock('@calistenia/core/hooks/useRestPreferences', () => ({
  useRestPreferences: () => ({ getRestForExercise: () => 60, setRestForExercise: vi.fn() }),
}))
vi.mock('@calistenia/core/hooks/useUserHealth', () => ({
  useUserHealth: () => ({ health: { injuries: [], medical_conditions: [] } }),
}))
vi.mock('../components/AppTour', () => ({ triggerWorkoutDetailTour: vi.fn() }))
vi.mock('../components/ExerciseCard', () => ({
  default: ({ exercise }: { exercise: { name: string } }) => <div data-testid="exercise">{exercise.name}</div>,
}))
vi.mock('../components/RestTimer', () => ({ default: () => null }))

import WorkoutPage from './WorkoutPage'

const day = (id: WeekDay['id'], type: WeekDay['type'], name: string): WeekDay => ({ id, name, focus: type, type, color: '#000' })
const WEEK: WeekDay[] = [
  day('lun', 'full', 'Lunes'), day('mar', 'rest', 'Martes'), day('mie', 'legs', 'Miércoles'),
  day('jue', 'rest', 'Jueves'), day('vie', 'full', 'Viernes'), day('sab', 'rest', 'Sábado'), day('dom', 'rest', 'Domingo'),
]
const workoutFor = (dayId: string): Workout => ({
  title: `Entreno ${dayId}`,
  exercises: [{ id: `${dayId}_1`, name: `Ejercicio ${dayId}`, sets: 3, reps: '10', rest: 60, notes: '' }],
} as unknown as Workout)

function mount(path = '/workout') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/workout" element={<WorkoutPage />} /></Routes>
    </MemoryRouter>,
  )
}

describe('WorkoutPage sin ?day= (#574)', () => {
  beforeEach(() => {
    h.weekDays = WEEK
    h.getWorkout.mockImplementation((_p: number, d: string) => WEEK.find(w => w.id === d)?.type === 'rest' ? null : workoutFor(d))
  })

  it('autoselecciona hoy y muestra ejercicios + EMPEZAR, no el estado vacío', () => {
    h.todayIndex = 1 // lunes
    mount()
    expect(screen.getByText('Ejercicio lun')).toBeTruthy()
    expect(document.querySelector('#tour-start-session')).not.toBeNull()
    expect(screen.queryByText('workout.chooseWorkout')).toBeNull()
  })

  it('?day= sigue mandando sobre el día de hoy', () => {
    h.todayIndex = 1
    mount('/workout?day=vie')
    expect(screen.getByText('Ejercicio vie')).toBeTruthy()
  })

  it('si hoy es descanso, salta al siguiente día entrenable', () => {
    h.todayIndex = 2 // martes (descanso) → miércoles
    mount()
    expect(screen.getByText('Ejercicio mie')).toBeTruthy()
  })

  it('en un día de descanso elegido a mano ofrece "entrenar de todas formas"', async () => {
    h.todayIndex = 1
    mount()
    await userEvent.click(screen.getByRole('button', { name: /^Martes/ }))
    expect(screen.getByText('workout.restDay')).toBeTruthy()
    await userEvent.click(screen.getByText('workout.trainAnyway:Miércoles'))
    expect(screen.getByText('Ejercicio mie')).toBeTruthy()
  })

  it('deseleccionar a mano no vuelve a autoseleccionar', async () => {
    h.todayIndex = 1
    mount()
    await userEvent.click(screen.getByRole('button', { name: /^Lunes/ }))
    expect(screen.getByText('workout.chooseWorkout')).toBeTruthy()
  })

  it('autoselecciona cuando la semana del programa llega después de montar', () => {
    h.todayIndex = 1
    h.weekDays = []
    const { rerender } = mount()
    h.weekDays = WEEK
    rerender(
      <MemoryRouter initialEntries={['/workout']}>
        <Routes><Route path="/workout" element={<WorkoutPage />} /></Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Ejercicio lun')).toBeTruthy()
  })
})

/**
 * #625 — un día de tipo `circuit` nunca arrancaba un circuito.
 *
 * La precondición del bug es sutil: un día de circuito CON ejercicios también
 * genera filas en `program_exercises`, así que `getWorkout()` devuelve un
 * `Workout` truthy. Como el ternario preguntaba por `workout` antes que por el
 * tipo del día, ganaba siempre la pantalla de fuerza. Por eso estos tests dan
 * un `getWorkout` que SÍ devuelve entreno: con `null` pasarían aun con el bug.
 */
describe('WorkoutPage en un día de circuito (#625)', () => {
  const CIRCUIT_WEEK: WeekDay[] = [
    day('lun', 'circuit', 'Lunes'), day('mar', 'rest', 'Martes'), day('mie', 'legs', 'Miércoles'),
    day('jue', 'rest', 'Jueves'), day('vie', 'full', 'Viernes'), day('sab', 'rest', 'Sábado'), day('dom', 'rest', 'Domingo'),
  ]
  const circuitCfg = {
    id: 'lun_circuit',
    name: { es: 'Circuito', en: 'Circuit' },
    mode: 'circuit',
    exercises: [
      { exerciseId: 'burpees', name: { es: 'Burpees', en: 'Burpees' }, reps: '10' },
      { exerciseId: 'jump_squats', name: { es: 'Sentadillas con salto', en: 'Jump Squats' }, reps: '15' },
    ],
    rounds: 4,
    restBetweenExercises: 15,
    restBetweenRounds: 60,
  }

  beforeEach(() => {
    h.todayIndex = 1 // lunes
    h.weekDays = CIRCUIT_WEEK
    h.activeProgram = { id: 'prog1', name: 'Programa' }
    h.circuitDayConfigs = { p1_lun: circuitCfg }
    h.startCircuit = vi.fn()
    // El día de circuito tiene ejercicios en `program_exercises`, así que
    // `getWorkout` devuelve un entreno: es justo lo que disparaba el bug.
    h.getWorkout.mockImplementation((_p: number, d: string) => CIRCUIT_WEEK.find(w => w.id === d)?.type === 'rest' ? null : workoutFor(d))
  })

  it('pinta la tarjeta de circuito, no la de fuerza, aunque haya `workout`', () => {
    mount()
    expect(screen.getByText('circuit.startCircuit')).toBeTruthy()
    expect(screen.getByText('circuit.summary:4,2')).toBeTruthy()
    // La UI de fuerza no debe aparecer: ni sus ejercicios ni el botón EMPEZAR.
    expect(screen.queryByText('Ejercicio lun')).toBeNull()
    expect(document.querySelector('#tour-start-session')).toBeNull()
  })

  it('lista los ejercicios del circuito', () => {
    mount()
    expect(screen.getByText('Burpees')).toBeTruthy()
    expect(screen.getByText('Sentadillas con salto')).toBeTruthy()
  })

  it('arranca con `p{fase}_{día}` como program_day_key, no con el día suelto', async () => {
    mount()
    await userEvent.click(screen.getByText('circuit.startCircuit'))
    expect(h.startCircuit).toHaveBeenCalledWith(circuitCfg, 'program', 'prog1', 'p1_lun')
  })

  it('sin ejercicios configurados deshabilita el arranque en vez de abrir un runner vacío', () => {
    h.circuitDayConfigs = { p1_lun: { ...circuitCfg, exercises: [] } }
    mount()
    expect(screen.getByText('circuit.noExercises')).toBeTruthy()
    expect(screen.getByText('circuit.startCircuit').closest('button')!.hasAttribute('disabled')).toBe(true)
  })

  it('cae al `circuitConfig` del WeekDay cuando el mapa no trae ese día', () => {
    h.circuitDayConfigs = {}
    h.weekDays = CIRCUIT_WEEK.map(d => d.id === 'lun' ? { ...d, circuitConfig: circuitCfg } : d)
    mount()
    expect(screen.getByText('circuit.startCircuit')).toBeTruthy()
    expect(screen.queryByText('Ejercicio lun')).toBeNull()
  })
})
