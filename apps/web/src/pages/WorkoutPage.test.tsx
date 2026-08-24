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

const h = vi.hoisted(() => ({
  todayIndex: 1, // lunes
  weekDays: [] as unknown[],
  getWorkout: vi.fn(),
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
    activeProgram: null,
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
vi.mock('../contexts/CircuitSessionContext', () => ({ useCircuitSession: () => ({ startCircuit: vi.fn() }) }))
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
