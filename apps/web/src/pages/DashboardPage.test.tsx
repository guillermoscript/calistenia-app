/**
 * Inicio simplificado hasta el 3.er entreno (#808).
 *
 * Tres tramos: `first` (0 entrenos), `early` (1-2) y `full` (3+). Lo que se
 * afirma aquí es lo que pedía el issue: qué se pinta en cada uno, que el
 * inicio simple NO monta los hooks de agua / sueño / ranking / actividad, que
 * el aviso nuevo no se solapa con ActivationCard y que las anclas del tour
 * (`#tour-progress`, `#tour-weekly-plan`) siguen en las tres vistas.
 *
 * El tramo lo decide `useHomeStage` (cubierto en su propio test y en
 * `resolveHomeStage` de core); aquí se fija a mano.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { homeShowAllKey, type HomeStage } from '@calistenia/core/lib/activation'
import type { ActivationCardMode } from '@calistenia/core/lib/activation'

// Sin backend de i18next las claves salen tal cual, con los params detrás.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
    i18n: { language: 'es' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const h = vi.hoisted(() => ({
  stage: 'first' as HomeStage,
  sessions: 0,
  pending: false,
  activationMode: 'start' as ActivationCardMode,
  lastSessionDate: null as string | null,
  /** `getTotalSessions()` (programa activo); null = igual que `sessions`. */
  programSessions: null as number | null,
  useWater: vi.fn(() => ({ todayTotal: 0, goal: 2000, addWater: () => {}, adding: false })),
  useSleep: vi.fn(() => ({ entries: [] })),
  useLeaderboard: vi.fn(() => ({ entries: { sessions_week: [] }, load: () => {} })),
  useActivityFeed: vi.fn(() => ({ items: [], load: () => {} })),
}))

vi.mock('@calistenia/core/hooks/useHomeStage', () => ({
  useHomeStage: () => ({ stage: h.stage, sessions: h.sessions, pending: h.pending }),
}))
vi.mock('@calistenia/core/hooks/useActivation', () => ({
  useActivation: () => ({ mode: h.activationMode }),
}))
vi.mock('@calistenia/core/hooks/useWater', () => ({ useWater: h.useWater }))
vi.mock('@calistenia/core/hooks/useSleep', () => ({ useSleep: h.useSleep }))
vi.mock('@calistenia/core/hooks/useLeaderboard', () => ({ useLeaderboard: h.useLeaderboard }))
vi.mock('@calistenia/core/hooks/useActivityFeed', () => ({ useActivityFeed: h.useActivityFeed }))

vi.mock('../contexts/AuthContext', () => ({
  useAuthState: () => ({ userId: 'u1', user: { id: 'u1', name: 'Ana', created: '2026-09-20 10:00:00.000Z' } }),
}))
vi.mock('../contexts/WorkoutContext', () => ({
  useWorkoutState: () => ({
    settings: { weeklyGoal: 5 },
    usePB: true,
    activeProgram: { id: 'p1', name: 'Programa Uno' },
    programs: [],
    phases: [{ id: 1, name: 'Base', weeks: '1-4' }],
    weekDays: [],
    programProgress: { currentPhase: 1, totalWeeks: 8, currentWeek: 1, percent: 0 },
  }),
  useWorkoutActions: () => ({
    getTotalSessions: () => h.programSessions ?? h.sessions,
    getLongestStreak: () => 0,
    getWeeklyDoneCount: () => 0,
    getMonthActivity: () => ({}),
    updateSettings: vi.fn(),
    isWorkoutDone: () => false,
    getLastSessionDate: () => h.lastSessionDate,
    getDoneDates: () => [],
    selectProgram: vi.fn(),
    duplicateProgram: vi.fn(),
    setPhaseOverride: vi.fn(),
  }),
}))

// Los widgets se sustituyen por marcas: aquí importa QUÉ se monta, no cómo pinta.
const { stub } = vi.hoisted(() => ({
  stub: (id: string) => ({ default: () => <div data-testid={id} /> }),
}))
vi.mock('../components/WeekPlanWidget', () => stub('week-plan'))
vi.mock('../components/ProgramSelectorModal', () => stub('program-modal'))
vi.mock('../components/dashboard/TodayWorkoutHero', () => stub('today-hero'))
vi.mock('../components/dashboard/ActivationCard', () => stub('activation-card'))
vi.mock('../components/WaterTracker', () => stub('water'))
vi.mock('../components/WorkoutReminderWidget', () => stub('reminders'))
vi.mock('../components/cardio/CardioWidget', () => stub('cardio'))
vi.mock('../components/sleep/SleepDashboardWidget', () => stub('sleep'))
vi.mock('../components/friends/LeaderboardWidget', () => stub('leaderboard'))
vi.mock('../components/friends/ActivityFeedWidget', () => stub('feed'))
vi.mock('../components/FeaturedChallengeCard', () => stub('featured-challenge'))
vi.mock('../components/CommunityProgramHomeCard', () => stub('community-program'))
vi.mock('../components/progress/PhasePhotoBanner', () => stub('phase-photo'))
vi.mock('../components/insights/InsightsCard', () => stub('insights'))
vi.mock('../components/insights/InsightsHistory', () => stub('insights-history'))
vi.mock('../components/StreakMilestone', () => ({
  default: () => null,
  getActiveMilestone: () => null,
  markMilestoneShown: () => {},
}))
vi.mock('../components/WhatsNew', () => ({ WhatsNewHomeButton: () => null }))

import DashboardPage from './DashboardPage'

const DATA_HOOKS = () => [h.useWater, h.useSleep, h.useLeaderboard, h.useActivityFeed]
const FULL_ONLY = ['phase-photo', 'featured-challenge', 'community-program', 'water', 'sleep', 'insights', 'insights-history']

function mount() {
  return render(
    <MemoryRouter>
      <DashboardPage cardioWeeklyStats={{} as never} cardioLastSession={null} />
    </MemoryRouter>,
  )
}

/** 'YYYY-MM-DD' de hace `n` días, en hora local (lo que compara la página). */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function expectCoreAnchors(container: HTMLElement) {
  // El tour del inicio (AppTour) busca estas anclas; tienen que estar en las tres vistas.
  expect(container.querySelector('#tour-progress')).not.toBeNull()
  expect(container.querySelector('#tour-weekly-plan')).not.toBeNull()
  expect(screen.getByTestId('today-hero')).toBeInTheDocument()
  expect(screen.getByTestId('activation-card')).toBeInTheDocument()
  expect(screen.getByTestId('week-plan')).toBeInTheDocument()
}

describe('DashboardPage — inicio simplificado (#808)', () => {
  beforeEach(() => {
    h.stage = 'first'
    h.sessions = 0
    h.programSessions = null
    h.pending = false
    h.activationMode = 'start'
    h.lastSessionDate = null
    for (const hook of DATA_HOOKS()) hook.mockClear()
  })

  describe('0 entrenos (first)', () => {
    it('vista mínima: hoy toca X + plan de la semana, sin widgets ni hooks de datos', () => {
      const { container } = mount()
      expectCoreAnchors(container)

      for (const id of FULL_ONLY) expect(screen.queryByTestId(id)).toBeNull()
      expect(screen.queryByText('dashboard.quickAction.nutrition')).toBeNull()
      expect(container.querySelector('#tour-stats')).toBeNull()
      expect(screen.queryByText('dashboard.config')).toBeNull()
      for (const hook of DATA_HOOKS()) expect(hook).not.toHaveBeenCalled()
    })

    it('bienvenida en vez de silencio; sin CTA propio si ActivationCard ya lo trae', () => {
      mount()
      expect(screen.getByText('dashboard.welcome.title')).toBeInTheDocument()
      expect(screen.queryByText('dashboard.welcome.cta')).toBeNull()
    })

    it('con la primera semana cerrada (tarjeta oculta) la bienvenida trae su CTA', () => {
      h.activationMode = 'hidden'
      mount()
      expect(screen.getByText('dashboard.welcome.title')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'dashboard.welcome.cta' })).toBeInTheDocument()
    })
  })

  describe('1-2 entrenos (early)', () => {
    beforeEach(() => {
      h.stage = 'early'
      h.sessions = 1
      h.activationMode = 'progress'
    })

    it('vista intermedia: añade la racha, sigue sin widgets ni hooks de datos', () => {
      const { container } = mount()
      expectCoreAnchors(container)
      expect(container.querySelector('#tour-stats')).not.toBeNull()

      for (const id of FULL_ONLY) expect(screen.queryByTestId(id)).toBeNull()
      expect(screen.queryByText('dashboard.quickAction.nutrition')).toBeNull()
      for (const hook of DATA_HOOKS()) expect(hook).not.toHaveBeenCalled()
    })

    it('con ActivationCard a la vista no hay un segundo aviso de progreso', () => {
      mount()
      expect(screen.queryByText(/dashboard\.earlyGoal/)).toBeNull()
      expect(screen.queryByText(/dashboard\.welcome/)).toBeNull()
    })

    it('con la tarjeta oculta, el progreso hacia el 3.º va en el aviso', () => {
      h.activationMode = 'hidden'
      h.sessions = 2
      mount()
      expect(screen.getByText('dashboard.earlyGoal.title:1')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'dashboard.earlyGoal.cta' })).toBeInTheDocument()
    })

    it('recién cambiado de programa (0 en el activo): no pinta una racha de ceros', () => {
      h.programSessions = 0
      const { container } = mount()
      expect(container.querySelector('#tour-stats')).toBeNull()
    })

    it('el aviso genérico de «X días sin entrenar» no sale antes del 3.º', () => {
      h.activationMode = 'hidden'
      h.lastSessionDate = daysAgo(5)
      mount()
      expect(screen.queryByText(/dashboard\.nudge\.title/)).toBeNull()
    })
  })

  describe('3+ entrenos (full)', () => {
    beforeEach(() => {
      h.stage = 'full'
      h.sessions = 12
      h.activationMode = 'hidden'
    })

    it('el inicio completo de siempre, con sus hooks de datos', () => {
      const { container } = mount()
      expectCoreAnchors(container)
      expect(container.querySelector('#tour-stats')).not.toBeNull()
      for (const id of FULL_ONLY) expect(screen.getByTestId(id)).toBeInTheDocument()
      expect(screen.getByText('dashboard.quickAction.nutrition')).toBeInTheDocument()
      expect(screen.getByText('dashboard.config')).toBeInTheDocument()
      for (const hook of DATA_HOOKS()) expect(hook).toHaveBeenCalled()
    })

    it('ni bienvenida ni «ver todo»; el aviso de inactividad sigue como antes', () => {
      h.lastSessionDate = daysAgo(5)
      mount()
      expect(screen.queryByText(/dashboard\.welcome|dashboard\.earlyGoal/)).toBeNull()
      expect(screen.queryByText('dashboard.showAll')).toBeNull()
      expect(screen.getByText('dashboard.nudge.title:5')).toBeInTheDocument()
    })
  })

  describe('tramo sin decidir (pending)', () => {
    it('mientras llega el contador de la cuenta: núcleo sí, bienvenida y «ver todo» no', () => {
      h.pending = true
      h.activationMode = 'hidden'
      const { container } = mount()
      expectCoreAnchors(container)
      expect(screen.queryByText(/dashboard\.welcome|dashboard\.earlyGoal/)).toBeNull()
      expect(screen.queryByText('dashboard.showAll')).toBeNull()
      for (const hook of DATA_HOOKS()) expect(hook).not.toHaveBeenCalled()
    })
  })

  describe('«Ver todo el inicio»', () => {
    it('despliega el inicio completo antes del 3.º y lo recuerda por usuario', async () => {
      const user = userEvent.setup()
      const { unmount } = mount()
      expect(screen.queryByTestId('water')).toBeNull()

      await user.click(screen.getByRole('button', { name: 'dashboard.showAll' }))
      expect(screen.getByTestId('water')).toBeInTheDocument()
      expect(screen.getByText('dashboard.quickAction.nutrition')).toBeInTheDocument()
      expect(h.useWater).toHaveBeenCalled()
      expect(window.localStorage.getItem(homeShowAllKey('u1'))).toBe('true')

      // Volver a entrar respeta la preferencia.
      unmount()
      mount()
      expect(screen.getByTestId('water')).toBeInTheDocument()

      // Y se puede deshacer.
      await user.click(screen.getByRole('button', { name: 'dashboard.showLess' }))
      expect(screen.queryByTestId('water')).toBeNull()
      expect(window.localStorage.getItem(homeShowAllKey('u1'))).toBeNull()
    })
  })
})
