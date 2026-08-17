import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Solo hace falta t(); sin backend de i18next las claves salen tal cual, que es
// lo que asercionamos. Se interpolan los params para poder leer "Te faltan 7".
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
    i18n: { language: 'es' },
  }),
  // `lib/share` arrastra `lib/i18n`, que hace `.use(initReactI18next)` al cargarse.
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('../lib/share', () => ({ shareChallenge: vi.fn() }))

const h = vi.hoisted(() => ({
  detail: {
    challenge: null as Record<string, unknown> | null,
    leaderboard: [] as unknown[],
    loading: false,
    participantIds: new Set<string>(),
    load: vi.fn(),
    inviteUser: vi.fn(),
  },
  express: { progress: [] as unknown[], loading: false },
}))

vi.mock('@calistenia/core/hooks/useChallengeDetail', () => ({
  useChallengeDetail: () => h.detail,
}))

vi.mock('@calistenia/core/hooks/useChallengeExpress', () => ({
  useExpressProgress: () => h.express,
}))

vi.mock('@calistenia/core/hooks/useFollows', () => ({
  useFollows: () => ({ following: [] }),
}))

vi.mock('@calistenia/core/lib/analytics', () => ({
  CANONICAL_ANALYTICS_EVENTS: new Proxy({}, { get: (_t, p) => String(p) }),
  trackCanonicalEvent: vi.fn(),
}))

// Etiquetas de métrica y fechas no son lo que se prueba aquí, y las reales tiran
// de la instancia de i18next de verdad.
vi.mock('@calistenia/core/lib/challenges', () => ({
  getMetricUnit: () => 'reps',
  getMetricLabel: () => 'metric-label',
  daysRemaining: () => 'days-left',
  // Las medallas sí son las reales: son datos, no traducciones, y el mock que
  // las omitiera dejaría `RANK_MEDALS` en undefined al pintar la clasificación.
  RANK_MEDALS: ['🥇', '🥈', '🥉'],
}))

vi.mock('@calistenia/core/lib/dateUtils', () => ({
  formatDateRange: () => '1 ago – 30 ago',
}))

vi.mock('@calistenia/core/lib/challenge-presets', () => ({
  resolvePresetChallengeTitle: (c: { title: string }) => c.title,
  resolvePresetChallengeDescription: (c: { description?: string }) => c.description ?? '',
}))

vi.mock('../components/ShareButton', () => ({
  ShareButton: () => <button type="button">share-stub</button>,
}))

import ChallengeDetailPage from './ChallengeDetailPage'

const USER_ID = 'me'

const ME = { userId: USER_ID, displayName: 'Yo', value: 5, avatarUrl: '', isCurrentUser: true }
const RIVAL = { userId: 'other', displayName: 'Rival', value: 9, avatarUrl: '', isCurrentUser: false }

function baseChallenge(over: Record<string, unknown>) {
  return {
    id: 'c1',
    creator: 'someone-else',
    title: 'Reto',
    metric: 'most_sessions',
    description: 'Una descripción',
    starts_at: '2026-08-01',
    ends_at: '2026-08-30',
    status: 'active',
    goal: 0,
    ...over,
  }
}

// Hace falta la <Route> con el patrón, no solo el MemoryRouter: la página lee el
// id con useParams() y sin la ruta declarada se rinde con `return null`.
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/challenges/c1']}>
      <Routes>
        <Route path="/challenges/:id" element={<ChallengeDetailPage userId={USER_ID} />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  h.detail.leaderboard = [RIVAL, ME]
  h.detail.loading = false
  h.detail.participantIds = new Set([USER_ID, 'other'])
  h.express.progress = []
  h.express.loading = false
})

describe('ChallengeDetailPage — rama con meta (#383)', () => {
  beforeEach(() => {
    h.detail.challenge = baseChallenge({ goal: 12, type: 'standard' })
  })

  it('pinta el progreso como héroe, con el valor y lo que falta', () => {
    renderPage()
    expect(screen.getByText('challenge.preset.progress')).toBeInTheDocument()
    expect(screen.getByText('challenge.goalRemaining:7 reps')).toBeInTheDocument()

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '5')
    expect(bar).toHaveAttribute('aria-valuemax', '12')
  })

  it('quita la píldora de meta, que ahora la dice el héroe', () => {
    renderPage()
    expect(screen.queryByText('challenges.goal:12')).not.toBeInTheDocument()
  })

  it('nace con la clasificación plegada y la abre al pulsar', async () => {
    renderPage()
    expect(screen.queryByText('Rival')).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { expanded: false })
    await userEvent.click(toggle)

    expect(screen.getByText('Rival')).toBeInTheDocument()
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument()
  })

  it('pinta el héroe a 0 aunque todavía no participes', () => {
    h.detail.leaderboard = [RIVAL]
    h.detail.participantIds = new Set(['other'])
    renderPage()

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByText('challenge.goalRemaining:12 reps')).toBeInTheDocument()
  })

  it('da la meta por alcanzada en vez de dejar el contador en negativo', () => {
    h.detail.leaderboard = [{ ...ME, value: 20 }]
    renderPage()

    expect(screen.getByText('challenge.preset.completed')).toBeInTheDocument()
    expect(screen.queryByText(/challenge\.goalRemaining/)).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20')
  })

  it('no repite "completado" en la fila meta: ahí sigue el tiempo que queda', () => {
    h.detail.leaderboard = [{ ...ME, value: 20 }]
    renderPage()

    expect(screen.getAllByText('challenge.preset.completed')).toHaveLength(1)
    expect(screen.getByText(/days-left/)).toBeInTheDocument()
  })
})

describe('ChallengeDetailPage — rama de ranking (#383)', () => {
  beforeEach(() => {
    h.detail.challenge = baseChallenge({ goal: 0 })
  })

  it('enseña la clasificación directamente, sin plegar ni héroe', () => {
    renderPage()
    expect(screen.getByText('Rival')).toBeInTheDocument()
    expect(screen.getByText('Yo')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText('challenge.preset.progress')).not.toBeInTheDocument()
    expect(screen.queryByText('challenge.leaderboard')).not.toBeInTheDocument()
  })

  it('deja tu fila pegada abajo para que no se pierda al hacer scroll', () => {
    const { container } = renderPage()
    const sticky = container.querySelectorAll('.sticky')
    expect(sticky).toHaveLength(1)
    expect(sticky[0].textContent).toContain('Yo')
  })
})

describe('ChallengeDetailPage — los retos express no se tocan (#383)', () => {
  it('mantiene su progreso diario aunque traigan meta', () => {
    h.detail.challenge = baseChallenge({ goal: 100, type: 'express', daily_target: 20, duration_days: 7 })
    h.detail.leaderboard = [ME]
    h.express.progress = [{
      participantId: USER_ID,
      participantName: 'Yo',
      avatarUrl: '',
      daysCompleted: 3,
      totalDays: 7,
      currentStreak: 2,
      dailyProgress: [{ date: '2026-08-01', value: 20, completed: true }],
    }]

    renderPage()

    // La rama express gana a la de meta: ni héroe ni clasificación plegada.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText('challenge.preset.progress')).not.toBeInTheDocument()
    expect(screen.queryByText('challenge.leaderboard')).not.toBeInTheDocument()
    expect(screen.getByText(/challenge\.expressStreak:2/)).toBeInTheDocument()
  })
})
