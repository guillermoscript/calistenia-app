/**
 * Inicio «qué hago hoy» (#855, épica #852).
 *
 * `useHomeToday` se sustituye por un `HomeToday` construido a mano con un
 * `HomeState` real por test: lo que se afirma aquí es qué pinta cada `kind`,
 * que solo hay UN botón principal (nunca lima), qué eventos de #854 se emiten,
 * que «Para ti» solo consulta datos a partir del 3.er entreno y que el inicio
 * ya no monta agua / sueño / ranking / actividad.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { getWeekSummary } from '@calistenia/core/lib/weekSummary'
import type { HomeDayRef, HomeState, HomeModifiers } from '@calistenia/core/lib/homeState'
import type { WeekDay, Workout, Exercise } from '@calistenia/core/types'
import type { HomeToday } from '../components/dashboard/useHomeToday'

// Sin backend de i18next las claves salen tal cual, con los params detrás.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
    i18n: { language: 'es' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const TODAY = '2026-09-30' // miércoles

const h = vi.hoisted(() => ({
  home: null as unknown as HomeToday,
  navigate: vi.fn(),
  startSession: vi.fn(),
  endSession: vi.fn(),
  selectProgram: vi.fn(async () => true),
  userId: 'u1' as string | null,
  programs: [] as unknown[],
  useWater: vi.fn(() => ({})),
  useSleep: vi.fn(() => ({})),
  useLeaderboard: vi.fn(() => ({})),
  useActivityFeed: vi.fn(() => ({})),
  useChallenges: vi.fn(() => ({ active: [] as unknown[] })),
  useFeaturedChallenge: vi.fn((_id: string | null) => ({ card: null as unknown })),
  useFollows: vi.fn(() => ({ following: [] as unknown[] })),
  useCommunityPrograms: vi.fn(() => ({ programs: [] as unknown[] })),
  useNutrition: vi.fn(() => ({
    goals: { dailyCalories: 2000 },
    getDailyTotals: (_day?: string) => ({ calories: 0 }),
  })),
  useFriendsTrainedToday: vi.fn(() => ({ ids: [] as string[], loading: false })),
  matchDesktop: false,
  battle: null as null | { id: string; status: string },
  workouts: {} as Record<string, Workout | null>,
  strengthActive: null as null | { title: string; exercises: Exercise[] },
  progress: {} as Record<string, unknown>,
}))

vi.mock('../components/dashboard/useHomeToday', () => ({ useHomeToday: () => h.home }))

vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => h.navigate,
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuthState: () => ({
    userId: h.userId,
    user: h.userId ? { id: h.userId, name: 'Ana', level: 'intermedio', referral_code: 'ANA1' } : null,
  }),
}))
vi.mock('../contexts/WorkoutContext', () => ({
  useWorkoutState: () => ({
    settings: { weeklyGoal: 4 },
    activeProgram: h.home.state.kind === 'no_program' ? null : { id: 'p1', name: 'Programa Uno', duration_weeks: 8 },
    programs: h.programs,
    progress: h.progress,
    phases: [{ id: 1, name: 'Base', weeks: '1-4' }, { id: 2, name: 'Fuerza', weeks: '5-8' }],
    weekDays: WEEK_DAYS,
    programProgress: { currentPhase: 1, totalWeeks: 8, currentWeek: 2, percent: 25 },
  }),
  useWorkoutActions: () => ({
    getTotalSessions: () => 12,
    getWorkout: (_phase: number, dayId: string) => h.workouts[dayId] ?? null,
    selectProgram: h.selectProgram,
  }),
}))
vi.mock('../contexts/ActiveSessionContext', () => ({
  useActiveSession: () => ({
    isActive: !!h.strengthActive,
    workout: h.strengthActive,
    startedAt: Date.now() - 5 * 60_000,
    startSession: h.startSession,
    endSession: h.endSession,
    getProgressSnapshot: () => ({ setsCount: 3, stepIdx: 1 }),
  }),
}))
vi.mock('../contexts/CardioSessionContext', () => ({
  useCardioSessionContext: () => ({
    state: 'idle', activityType: 'running', distance: 0, duration: 0, programDayKey: null, discard: vi.fn(),
  }),
}))
vi.mock('../contexts/CircuitSessionContext', () => ({
  useCircuitSession: () => ({
    isActive: false, circuit: null, startedAt: null, startCircuit: vi.fn(), abandonCircuit: vi.fn(),
  }),
}))

vi.mock('@calistenia/core/hooks/useWater', () => ({ useWater: h.useWater }))
vi.mock('@calistenia/core/hooks/useSleep', () => ({ useSleep: h.useSleep }))
vi.mock('@calistenia/core/hooks/useLeaderboard', () => ({ useLeaderboard: h.useLeaderboard }))
vi.mock('@calistenia/core/hooks/useActivityFeed', () => ({ useActivityFeed: h.useActivityFeed }))
vi.mock('@calistenia/core/hooks/useChallenges', () => ({ useChallenges: h.useChallenges }))
vi.mock('@calistenia/core/hooks/useFeaturedChallenge', () => ({ useFeaturedChallenge: h.useFeaturedChallenge }))
vi.mock('@calistenia/core/hooks/useFollows', () => ({ useFollows: h.useFollows }))
vi.mock('@calistenia/core/hooks/useCommunityPrograms', () => ({ useCommunityPrograms: h.useCommunityPrograms }))
vi.mock('@calistenia/core/hooks/useNutrition', () => ({ useNutrition: h.useNutrition }))
vi.mock('@calistenia/core/hooks/useActiveBattle', () => ({
  useActiveBattle: () => ({ data: h.battle }),
}))
vi.mock('@calistenia/core/hooks/useFriendsTrainedToday', () => ({ useFriendsTrainedToday: h.useFriendsTrainedToday }))

vi.mock('@calistenia/core/lib/home-analytics', async importOriginal => {
  const actual = await importOriginal<typeof import('@calistenia/core/lib/home-analytics')>()
  return {
    ...actual,
    trackHomeViewed: vi.fn(),
    resetHomeView: vi.fn(),
    trackHomePrimaryCta: vi.fn(),
    trackHomeChangeDay: vi.fn(),
    trackHomeParaTiTap: vi.fn(),
    trackHomeSecondaryTap: vi.fn(),
  }
})
// El hito semanal no emite analítica real en estos tests.
vi.mock('@calistenia/core/lib/analytics', async importOriginal => ({
  ...(await importOriginal<typeof import('@calistenia/core/lib/analytics')>()),
  trackCanonicalEvent: vi.fn(),
}))

import * as analytics from '@calistenia/core/lib/home-analytics'
import DashboardPage from './DashboardPage'

// ── Fixtures ────────────────────────────────────────────────────────────────

const day = (id: WeekDay['id'], type: WeekDay['type'], extra: Partial<WeekDay> = {}): WeekDay => ({
  id, name: id, focus: `Foco ${id}`, type, color: '#fff', ...extra,
})

const WEEK_DAYS: WeekDay[] = [
  day('lun', 'push'),
  day('mar', 'rest'),
  day('mie', 'pull'),
  day('jue', 'rest'),
  day('vie', 'legs'),
  day('sab', 'cardio', { cardioConfig: { activityType: 'running', targetDistanceKm: 5, targetDurationMin: 30 } }),
  day('dom', 'rest'),
]

const exercise = (id: string, name: string): Exercise => ({
  id, name, sets: 3, reps: '10', rest: 60, muscles: '', note: '', youtube: '', priority: 'high',
})

const WORKOUT: Workout = {
  title: 'Tirón A',
  exercises: [exercise('e1', 'Dominadas'), exercise('e2', 'Remo'), exercise('e3', 'Curl')],
} as unknown as Workout

const modifiers = (over: Partial<HomeModifiers> = {}): HomeModifiers => ({
  inactiveDays: null, firstWeek: null, offline: false, unsynced: false, loading: false, ...over,
})

const dayRef = (dayId: HomeDayRef['dayId'], dayType: HomeDayRef['dayType'] = 'strength', date = TODAY): HomeDayRef => ({
  dayId, date, workoutKey: `p1_${dayId}`, dayType, index: 2, of: 4,
})

type StateBody = Omit<HomeState, 'modifiers'>

function makeHome(
  body: StateBody,
  over: { mods?: Partial<HomeModifiers>; sessions?: number; streak?: number; activity?: string[] } = {},
): HomeToday {
  const streak = over.streak ?? 0
  return {
    state: { ...body, modifiers: modifiers(over.mods) } as HomeState,
    today: TODAY,
    week: getWeekSummary({ today: TODAY, activityDays: over.activity ?? [], weekDays: WEEK_DAYS }),
    goal: 4,
    streak: { current: streak, best: streak, thisWeek: { weekStart: '2026-09-28', done: 1, goal: 4, met: false, remaining: 3 } },
    accountSessions: over.sessions ?? 10,
    phase: 1,
    workoutFor: (dayId: string) => h.workouts[dayId] ?? null,
  }
}

function setMatchMedia(desktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: desktop, media: query, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    }),
  })
}

function mount() {
  return render(
    <MemoryRouter>
      <DashboardPage cardioLastSession={null} />
    </MemoryRouter>,
  )
}

const state = (kind: string) => screen.getByTestId('home-today').getAttribute('data-state') === kind

const PARA_TI_HOOKS = () => [h.useChallenges, h.useFeaturedChallenge, h.useFollows, h.useCommunityPrograms, h.useNutrition]
const NEVER_HOOKS = () => [h.useWater, h.useSleep, h.useLeaderboard, h.useActivityFeed]

/** Datos suficientes para que «Para ti» tenga 3 filas posibles. */
function seedParaTiData() {
  h.useChallenges.mockReturnValue({
    active: [{ id: 'c1', title: 'Reto', ends_at: '2026-10-10 00:00:00.000Z', preset_key: null }],
  })
  h.useFollows.mockReturnValue({ following: [{ id: 'f1', displayName: 'Bea', username: 'bea' }] })
  h.useFriendsTrainedToday.mockReturnValue({ ids: ['f1'], loading: false })
  h.useNutrition.mockReturnValue({
    goals: { dailyCalories: 2000 },
    getDailyTotals: (_d?: string) => ({ calories: 1200 }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setMatchMedia(false)
  h.userId = 'u1'
  h.programs = []
  h.workouts = { mie: WORKOUT, lun: WORKOUT, vie: WORKOUT }
  h.strengthActive = null
  h.battle = null
  h.progress = {}
  h.useChallenges.mockReturnValue({ active: [] })
  h.useFeaturedChallenge.mockReturnValue({ card: null })
  h.useFollows.mockReturnValue({ following: [] })
  h.useCommunityPrograms.mockReturnValue({ programs: [] })
  h.useFriendsTrainedToday.mockReturnValue({ ids: [], loading: false })
  h.useNutrition.mockReturnValue({ goals: { dailyCalories: 2000 }, getDailyTotals: (_d?: string) => ({ calories: 0 }) })
  h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false })
})

// ── Cada estado ─────────────────────────────────────────────────────────────

describe('DashboardPage · un bloque por estado', () => {
  it('training_day de fuerza: título del entreno, ejercicios y botón «Empezar»', () => {
    mount()
    expect(state('training_day')).toBe(true)
    expect(screen.getByRole('heading', { level: 2, name: 'Tirón A' })).toBeInTheDocument()
    expect(screen.getByText('home.action.start')).toBeInTheDocument()
    expect(screen.getAllByText('Dominadas').length).toBeGreaterThan(0)
    expect(screen.getByText('home.action.changeDay')).toBeInTheDocument()
    expect(screen.queryByText('home.deload.banner')).not.toBeInTheDocument()
  })

  it('training_day de fuerza: «Retar a un amigo» abre la batalla con el día; en cardio no sale', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByText('battle.challengeFriend'))
    expect(h.navigate).toHaveBeenCalledWith('/battle-create?origin=program_day&phase=1&day=mie')
  })

  it('training_day de cardio: objetivo, «Empezar cardio» y sin lista de ejercicios', () => {
    h.home = makeHome({ kind: 'training_day', day: dayRef('sab', 'cardio'), deload: false })
    mount()
    expect(state('training_day')).toBe(true)
    expect(screen.getByText('home.action.startCardio')).toBeInTheDocument()
    expect(screen.getByText('5 km')).toBeInTheDocument()
    expect(screen.getByText('30 min')).toBeInTheDocument()
    expect(screen.queryByText('Dominadas')).not.toBeInTheDocument()
  })

  it('training_day en semana de descarga: aviso de descarga', () => {
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: true })
    mount()
    expect(screen.getByText('home.deload.banner')).toBeInTheDocument()
  })

  it('training_day con días sin entrenar: aviso «llevas N días»', () => {
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false }, { mods: { inactiveDays: 4 } })
    mount()
    expect(screen.getByTestId('home-inactive')).toBeInTheDocument()
  })

  it('done_today: resumen y compartir, siguiente día, y NINGÚN botón principal', () => {
    h.home = makeHome({
      kind: 'done_today', day: dayRef('mie'), variant: 'default', next: dayRef('vie', 'strength', '2026-10-02'),
    })
    mount()
    expect(state('done_today')).toBe(true)
    expect(screen.getByText('home.kicker.doneToday')).toBeInTheDocument()
    expect(screen.getByText('home.action.viewSummary')).toBeInTheDocument()
    expect(screen.getByText('home.action.share')).toBeInTheDocument()
    expect(screen.queryByTestId('home-primary')).not.toBeInTheDocument()
  })

  it('rest_day: título de descanso, siguiente entreno y opciones suaves, sin botón principal', () => {
    h.home = makeHome({ kind: 'rest_day', comingSoon: false, next: dayRef('vie', 'strength', '2026-10-02') })
    mount()
    expect(state('rest_day')).toBe(true)
    expect(screen.getByText('home.rest.title')).toBeInTheDocument()
    expect(screen.getByText('home.action.viewWorkout')).toBeInTheDocument()
    expect(screen.getByText('home.rest.mobility')).toBeInTheDocument()
    expect(screen.queryByTestId('home-primary')).not.toBeInTheDocument()
  })

  it('rest_day «próximamente»: cuerpo de contenido pendiente', () => {
    h.home = makeHome({ kind: 'rest_day', comingSoon: true, next: null })
    mount()
    expect(screen.getByText('home.rest.comingSoon')).toBeInTheDocument()
  })

  it('week_complete: título de semana cumplida y sin botón principal', () => {
    h.home = makeHome({ kind: 'week_complete', next: dayRef('vie', 'strength', '2026-10-02') }, { streak: 3 })
    mount()
    expect(state('week_complete')).toBe(true)
    expect(screen.getByText('home.weekComplete.title')).toBeInTheDocument()
    expect(screen.getByText('home.action.shareWeek')).toBeInTheDocument()
    expect(screen.queryByTestId('home-primary')).not.toBeInTheDocument()
  })

  it('comeback: título de vuelta, día que toca y botón principal', () => {
    h.home = makeHome({ kind: 'comeback', daysSinceLast: 9, day: dayRef('mie') })
    mount()
    expect(state('comeback')).toBe(true)
    expect(screen.getByText('home.comeback.title')).toBeInTheDocument()
    expect(screen.getByText('home.action.startShort')).toBeInTheDocument()
    expect(screen.getByText('home.action.chooseOtherDay')).toBeInTheDocument()
  })

  it('first_workout con ventana abierta: sesión curada y meta de primera semana en vez de la semana', () => {
    h.home = makeHome(
      { kind: 'first_workout', showActivationGoal: true },
      { sessions: 0, mods: { firstWeek: { done: 0, target: 3, daysRemaining: 7, reached: false } } },
    )
    mount()
    expect(state('first_workout')).toBe(true)
    expect(screen.getByText('home.firstWorkout.title')).toBeInTheDocument()
    expect(screen.getByTestId('home-first-week')).toBeInTheDocument()
    expect(screen.queryByTestId('home-week-plan')).toBeNull()
  })

  it('first_workout sin ventana: ni meta ni semana', () => {
    h.home = makeHome({ kind: 'first_workout', showActivationGoal: false }, { sessions: 0 })
    mount()
    expect(state('first_workout')).toBe(true)
    expect(screen.queryByTestId('home-first-week')).not.toBeInTheDocument()
    expect(screen.queryByTestId('home-week-count')).not.toBeInTheDocument()
  })

  it('no_program: recomendados y «Empezar programa»', () => {
    h.programs = [
      { id: 'a', name: 'Programa A', difficulty: 'intermediate', duration_weeks: 8, days_per_week: 4 },
      { id: 'b', name: 'Programa B', difficulty: 'beginner', duration_weeks: 6, days_per_week: 3 },
    ]
    h.home = makeHome({ kind: 'no_program' })
    mount()
    expect(state('no_program')).toBe(true)
    expect(screen.getByText('home.noProgram.title')).toBeInTheDocument()
    expect(screen.getByText('Programa A')).toBeInTheDocument()
    expect(screen.getByTestId('home-primary')).toHaveTextContent('home.action.startProgram:Programa A')
  })

  it('program_complete: título y siguiente programa recomendado', () => {
    h.programs = [{ id: 'z', name: 'Siguiente', difficulty: 'intermediate', duration_weeks: 8, days_per_week: 4 }]
    h.home = makeHome({ kind: 'program_complete' })
    mount()
    expect(state('program_complete')).toBe(true)
    expect(screen.getByText('home.programComplete.nextRecommended')).toBeInTheDocument()
    expect(screen.getByTestId('home-primary')).toHaveTextContent('home.action.startProgram:Siguiente')
  })

  it('in_progress de fuerza: «Continuar» lleva a /session y descartar abre el diálogo', async () => {
    h.strengthActive = { title: 'Tirón A', exercises: WORKOUT.exercises as Exercise[] }
    h.home = makeHome({
      kind: 'in_progress', activity: { type: 'strength', startedDay: TODAY, workoutKey: 'p1_mie' }, fromAnotherDay: false,
    })
    const user = userEvent.setup()
    mount()
    expect(state('in_progress')).toBe(true)
    expect(screen.getByTestId('home-primary')).toHaveTextContent('home.action.continue')

    await user.click(screen.getByTestId('home-primary'))
    expect(h.navigate).toHaveBeenCalledWith('/session')

    await user.click(screen.getByText('home.action.discard'))
    expect(await screen.findByText('session.discardTitle')).toBeInTheDocument()
    await user.click(screen.getByText('session.discardButton'))
    expect(h.endSession).toHaveBeenCalledTimes(1)
  })

  it('in_progress de batalla: «Continuar batalla» lleva a la sala y no se descarta desde aquí', async () => {
    h.battle = { id: 'b1', status: 'live' }
    h.home = makeHome({ kind: 'in_progress', activity: { type: 'battle' }, fromAnotherDay: false })
    const user = userEvent.setup()
    mount()
    expect(state('in_progress')).toBe(true)
    expect(screen.getByTestId('home-primary')).toHaveTextContent('home.inProgress.continueBattle')
    expect(screen.queryByText('home.action.discard')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('home-primary'))
    expect(h.navigate).toHaveBeenCalledWith('/battle/b1')
  })

  it('loading: esqueleto y ni bloque «Hoy» ni «Para ti»', () => {
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false }, { mods: { loading: true } })
    mount()
    expect(screen.getByTestId('home-today-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('home-today')).not.toBeInTheDocument()
    expect(screen.queryByTestId('home-primary')).not.toBeInTheDocument()
    PARA_TI_HOOKS().forEach(hook => expect(hook).not.toHaveBeenCalled())
  })
})

// ── Botón principal ─────────────────────────────────────────────────────────

describe('DashboardPage · botón principal', () => {
  it.each([
    ['training_day', { kind: 'training_day', day: dayRef('mie'), deload: false }],
    ['comeback', { kind: 'comeback', daysSinceLast: 9, day: dayRef('mie') }],
    ['first_workout', { kind: 'first_workout', showActivationGoal: false }],
    ['no_program', { kind: 'no_program' }],
    ['program_complete', { kind: 'program_complete' }],
    ['in_progress', { kind: 'in_progress', activity: { type: 'strength', startedDay: TODAY }, fromAnotherDay: false }],
  ] as [string, StateBody][])('%s: exactamente UN botón principal y no es lima', (_kind, body) => {
    h.strengthActive = { title: 'Tirón A', exercises: WORKOUT.exercises as Exercise[] }
    h.home = makeHome(body, { sessions: body.kind === 'first_workout' ? 0 : 10 })
    mount()
    const primary = screen.getAllByTestId('home-primary')
    expect(primary).toHaveLength(1)
    expect(primary[0].className).not.toContain('bg-lime')
  })

  it.each([
    ['done_today', { kind: 'done_today', day: dayRef('mie'), variant: 'default', next: null }],
    ['rest_day', { kind: 'rest_day', comingSoon: false, next: null }],
    ['week_complete', { kind: 'week_complete', next: null }],
  ] as [string, StateBody][])('%s: ningún botón principal', (_kind, body) => {
    h.home = makeHome(body)
    mount()
    expect(screen.queryByTestId('home-primary')).not.toBeInTheDocument()
  })

  it('pulsarlo emite home_primary_cta con el estado', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByTestId('home-primary'))
    expect(analytics.trackHomePrimaryCta).toHaveBeenCalledTimes(1)
    expect(analytics.trackHomePrimaryCta).toHaveBeenCalledWith({ state: 'training_day' })
  })

  it('training_day de fuerza: startSession(workout, clave, «program») y navega a /session', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByTestId('home-primary'))
    expect(h.startSession).toHaveBeenCalledWith(WORKOUT, 'p1_mie', 'program')
    expect(h.navigate).toHaveBeenCalledWith('/session')
  })

  it('training_day de cardio: va a /cardio con el objetivo, sin empezar sesión de fuerza', async () => {
    h.home = makeHome({ kind: 'training_day', day: dayRef('sab', 'cardio'), deload: false })
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByTestId('home-primary'))
    expect(h.startSession).not.toHaveBeenCalled()
    const url = String(h.navigate.mock.calls[0][0])
    expect(url).toContain('/cardio?')
    expect(url).toContain('targetKm=5')
    expect(url).toContain('dayKey=p1_sab')
  })

  it('«Cambiar día» emite home_change_day y abre el selector en el sitio', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByText('home.action.changeDay'))
    expect(analytics.trackHomeChangeDay).toHaveBeenCalledTimes(1)
    expect(h.navigate).not.toHaveBeenCalled()
    expect(screen.getByTestId('home-day-picker')).toBeInTheDocument()
  })

  it('elegir un día enseña ese día con «Elegido» y «Volver a hoy» lo deshace', async () => {
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByText('home.action.changeDay'))
    const picker = screen.getByTestId('home-day-picker')
    expect(within(picker).queryByText('day.mie')).toBeInTheDocument() // hoy sigue elegible
    await user.click(within(picker).getByText('day.vie'))
    expect(h.navigate).not.toHaveBeenCalled()
    expect(screen.getByTestId('home-today').getAttribute('data-state')).toBe('chosen_day')
    expect(screen.getByText('home.kicker.chosenDay:day.inSentence.vie')).toBeInTheDocument()
    await user.click(screen.getByText('home.action.backToToday'))
    expect(state('training_day')).toBe(true)
    expect(screen.queryByText('home.action.backToToday')).not.toBeInTheDocument()
  })

  it('una acción secundaria emite home_secondary_tap y enseña el día en el sitio', async () => {
    h.home = makeHome({ kind: 'rest_day', comingSoon: false, next: dayRef('vie', 'strength', '2026-10-02') })
    const user = userEvent.setup()
    mount()
    await user.click(screen.getByText('home.action.viewWorkout'))
    expect(analytics.trackHomeSecondaryTap).toHaveBeenCalledWith({ target: 'next_day', state: 'rest_day' })
    expect(state('chosen_day')).toBe(true)
  })

  it('done_today de fuerza: minutos de la sesión y series planificadas', () => {
    h.progress = { [`done_${TODAY}_p1_mie`]: { durationSeconds: 48 * 60 } }
    h.home = makeHome({ kind: 'done_today', day: dayRef('mie'), variant: 'default', next: null })
    mount()
    const stats = screen.getByTestId('home-done-stats')
    expect(within(stats).getByText('48')).toBeInTheDocument()
    expect(within(stats).getByText('home.done.minutes')).toBeInTheDocument()
    expect(within(stats).getByText('9')).toBeInTheDocument() // 3 ejercicios × 3 series
    expect(within(stats).getByText('home.done.sets')).toBeInTheDocument()
  })
})

// ── home_viewed ─────────────────────────────────────────────────────────────

describe('DashboardPage · home_viewed', () => {
  it('una sola vez por visita, con estado y modificadores, y no en cada render', () => {
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: true }, { mods: { inactiveDays: 4 } })
    const { rerender } = mount()
    expect(analytics.trackHomeViewed).toHaveBeenCalledTimes(1)
    expect(analytics.trackHomeViewed).toHaveBeenCalledWith({
      state: 'training_day',
      modifiers: expect.arrayContaining(['deload', 'inactive']),
    })
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: true }, { mods: { inactiveDays: 4 } })
    rerender(<MemoryRouter><DashboardPage cardioLastSession={null} /></MemoryRouter>)
    expect(analytics.trackHomeViewed).toHaveBeenCalledTimes(1)
  })

  it('no se emite mientras carga; sí cuando el estado se resuelve', () => {
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false }, { mods: { loading: true } })
    const { rerender } = mount()
    expect(analytics.trackHomeViewed).not.toHaveBeenCalled()

    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false })
    rerender(<MemoryRouter><DashboardPage cardioLastSession={null} /></MemoryRouter>)
    expect(analytics.trackHomeViewed).toHaveBeenCalledTimes(1)
  })

  it('resetHomeView al desmontar (un tick después)', () => {
    vi.useFakeTimers()
    try {
      const { unmount } = mount()
      expect(analytics.resetHomeView).not.toHaveBeenCalled()
      unmount()
      vi.runAllTimers()
      expect(analytics.resetHomeView).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('un remontaje inmediato (StrictMode) cancela el olvido', () => {
    vi.useFakeTimers()
    try {
      const first = mount()
      first.unmount()
      mount()
      vi.runAllTimers()
      expect(analytics.resetHomeView).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── Para ti ─────────────────────────────────────────────────────────────────

describe('DashboardPage · Para ti', () => {
  it.each([0, 1, 2])('con %i entrenos en la cuenta no se monta ni consulta nada', sessions => {
    seedParaTiData()
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false }, { sessions })
    mount()
    expect(screen.queryByTestId('home-para-ti')).not.toBeInTheDocument()
    PARA_TI_HOOKS().forEach(hook => expect(hook).not.toHaveBeenCalled())
    expect(h.useFriendsTrainedToday).not.toHaveBeenCalled()
  })

  it('con una sesión en curso tampoco, aunque haya 10 entrenos', () => {
    seedParaTiData()
    h.strengthActive = { title: 'Tirón A', exercises: WORKOUT.exercises as Exercise[] }
    h.home = makeHome(
      { kind: 'in_progress', activity: { type: 'strength', startedDay: TODAY }, fromAnotherDay: false },
      { sessions: 10 },
    )
    mount()
    expect(screen.queryByTestId('home-para-ti')).not.toBeInTheDocument()
    PARA_TI_HOOKS().forEach(hook => expect(hook).not.toHaveBeenCalled())
  })

  it('con 3 o más entrenos consulta los datos y pinta como mucho 2 filas en móvil', () => {
    seedParaTiData()
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false }, { sessions: 3 })
    mount()
    PARA_TI_HOOKS().forEach(hook => expect(hook).toHaveBeenCalled())
    expect(h.useFriendsTrainedToday).toHaveBeenCalledWith('u1', ['f1'])
    const rows = within(screen.getByTestId('home-para-ti')).getAllByRole('button')
    expect(rows).toHaveLength(2)
  })

  it('con una batalla en marcha, su fila va la primera y lleva a la sala', async () => {
    seedParaTiData()
    h.battle = { id: 'b1', status: 'lobby' }
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false }, { sessions: 3 })
    const user = userEvent.setup()
    mount()
    const rows = within(screen.getByTestId('home-para-ti')).getAllByRole('button')
    expect(rows[0]).toHaveTextContent('home.paraTi.battleYourTurn')
    await user.click(rows[0])
    expect(h.navigate).toHaveBeenCalledWith('/battle/b1')
  })

  it('en escritorio pinta hasta 3 filas', () => {
    seedParaTiData()
    setMatchMedia(true)
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false }, { sessions: 3 })
    mount()
    expect(within(screen.getByTestId('home-para-ti')).getAllByRole('button')).toHaveLength(3)
  })

  it('pulsar una fila emite home_para_ti_tap y navega', async () => {
    seedParaTiData()
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false }, { sessions: 5 })
    const user = userEvent.setup()
    mount()
    const [first] = within(screen.getByTestId('home-para-ti')).getAllByRole('button')
    await user.click(first)
    expect(analytics.trackHomeParaTiTap).toHaveBeenCalledWith({ kind: 'challenge_progress' })
    expect(h.navigate).toHaveBeenCalledWith('/challenges/c1')
  })

  it('sin filas aplicables no pinta la sección', () => {
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false }, { sessions: 5 })
    mount()
    expect(h.useChallenges).toHaveBeenCalled()
    expect(screen.queryByTestId('home-para-ti')).not.toBeInTheDocument()
  })
})

// ── Lo que ya no vive en el inicio ──────────────────────────────────────────

describe('DashboardPage · sin widgets retirados', () => {
  it('nunca monta agua, sueño, ranking ni actividad', () => {
    seedParaTiData()
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false }, { sessions: 20 })
    mount()
    NEVER_HOOKS().forEach(hook => expect(hook).not.toHaveBeenCalled())
  })
})

// ── Semana y racha ──────────────────────────────────────────────────────────

describe('DashboardPage · semana y racha', () => {
  it('enseña el recuento de la semana y 7 celdas con etiqueta accesible', () => {
    mount()
    expect(screen.getByTestId('home-week-count')).toHaveTextContent('home.week.count')
    expect(screen.queryByTestId('home-week-plan')).not.toBeNull()
    const cells = within(screen.getByTestId('home-week-plan')).getAllByRole('img')
    expect(cells).toHaveLength(7)
    cells.forEach(cell => expect(cell.getAttribute('aria-label')).toBeTruthy())
  })

  it('con racha 0 no hay línea de racha', () => {
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false }, { streak: 0 })
    mount()
    expect(screen.queryByTestId('home-streak')).not.toBeInTheDocument()
  })

  it('con racha > 0 sí', () => {
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false }, { streak: 2 })
    mount()
    expect(screen.getByTestId('home-streak')).toBeInTheDocument()
  })

  it('la meta de primera semana sustituye a la racha', () => {
    h.home = makeHome(
      { kind: 'training_day', day: dayRef('mie'), deload: false },
      { streak: 2, mods: { firstWeek: { done: 1, target: 3, daysRemaining: 5, reached: false } } },
    )
    mount()
    expect(screen.getByTestId('home-first-week')).toBeInTheDocument()
    expect(screen.queryByTestId('home-streak')).not.toBeInTheDocument()
  })

  it('hito semanal: aparece con 4 semanas, y no otra vez una vez enseñado', () => {
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false }, { streak: 4 })
    const first = mount()
    expect(screen.getByRole('status')).toBeInTheDocument()
    first.unmount()

    localStorage.setItem('calistenia_weekly_milestone_4_u1', 'true')
    mount()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('sin hito por debajo de 4 semanas', () => {
    h.home = makeHome({ kind: 'training_day', day: dayRef('mie'), deload: false }, { streak: 3 })
    mount()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

// ── localStorage heredado de #808 ───────────────────────────────────────────

describe('DashboardPage · claves de #808', () => {
  it('borra «ver todo el inicio» y NO toca `calistenia_home_full_<uid>`', () => {
    localStorage.setItem('calistenia_home_show_all_u1', '1')
    localStorage.setItem('calistenia_home_full_u1', '1')
    mount()
    expect(localStorage.getItem('calistenia_home_show_all_u1')).toBeNull()
    expect(localStorage.getItem('calistenia_home_full_u1')).toBe('1')
  })
})
