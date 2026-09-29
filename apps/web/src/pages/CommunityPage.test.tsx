/**
 * Tablero Comunidad (#857).
 *
 * Lo que pedía el issue: tres pestañas enlazables con `?tab=` (y el botón atrás
 * vuelve a la anterior), estado vacío para quien no sigue a nadie, y que la
 * pestaña Actividad NO cargue el ranking completo (9 consultas por persona),
 * solo el resumen semanal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import type { WeeklyRanking } from '@calistenia/core/hooks/useWeeklyRanking'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
    i18n: { language: 'es' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const row = (userId: string, value: number, position: number, isCurrentUser = false) => ({
  userId, displayName: userId, avatarUrl: null, value, position, isCurrentUser,
})

const h = vi.hoisted(() => ({
  ranking: { followingCount: 0, top: [], me: null } as WeeklyRanking,
  rankingLoading: false,
  rankingError: null as string | null,
  reloadRanking: vi.fn(),
  feedItems: [] as unknown[],
  useLeaderboard: vi.fn(() => ({
    entries: { sessions_week: [], sessions_month: [] }, loading: false, error: null, load: async () => {},
  })),
  loadFeed: vi.fn(),
}))

vi.mock('@calistenia/core/hooks/useWeeklyRanking', () => ({
  useWeeklyRanking: () => ({ ranking: h.ranking, loading: h.rankingLoading, error: h.rankingError, reload: h.reloadRanking }),
}))
vi.mock('@calistenia/core/hooks/useActivityFeed', () => ({
  useActivityFeed: () => ({ items: h.feedItems, loading: false, load: h.loadFeed }),
}))
vi.mock('@calistenia/core/hooks/useLeaderboard', () => ({ useLeaderboard: h.useLeaderboard }))
vi.mock('@calistenia/core/lib/analytics', async (orig) => ({
  ...(await orig<typeof import('@calistenia/core/lib/analytics')>()),
  trackCanonicalEvent: vi.fn(),
}))

vi.mock('../components/FeaturedChallengeCard', () => ({ default: () => <div data-testid="featured-challenge" /> }))
vi.mock('../components/friends/ActivityFeedWidget', () => ({ default: () => <div data-testid="friends-feed" /> }))
vi.mock('./ChallengesPage', () => ({
  default: ({ embedded }: { embedded?: boolean }) => <div data-testid="challenges-page" data-embedded={String(!!embedded)} />,
}))

import CommunityPage from './CommunityPage'

function Probe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <div data-testid="search">{location.search}</div>
      <button type="button" onClick={() => navigate(-1)}>back</button>
    </>
  )
}

function renderAt(url = '/community') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <CommunityPage userId="me" />
      <Probe />
    </MemoryRouter>,
  )
}

const selectedTab = () => screen.getByRole('tab', { selected: true }).textContent

beforeEach(() => {
  h.ranking = { followingCount: 0, top: [], me: null }
  h.rankingLoading = false
  h.rankingError = null
  h.reloadRanking.mockClear()
  h.feedItems = []
  h.useLeaderboard.mockClear()
})

describe('CommunityPage', () => {
  it('opens Activity by default and on an unknown ?tab', () => {
    renderAt('/community?tab=nope')
    expect(selectedTab()).toBe('community.tab.activity')
    expect(screen.getByTestId('featured-challenge')).toBeTruthy()
  })

  it('cleans an unknown ?tab from the URL without adding a history entry', async () => {
    const user = userEvent.setup()
    renderAt('/community?tab=nope&x=1')
    expect(selectedTab()).toBe('community.tab.activity')
    expect(screen.getByTestId('search').textContent).toBe('?x=1')
    // replace, no push: atrás no vuelve al enlace roto (no hay entrada previa).
    await user.click(screen.getByRole('button', { name: 'back' }))
    expect(screen.getByTestId('search').textContent).toBe('?x=1')
  })

  it('leaves a valid ?tab untouched', () => {
    renderAt('/community?tab=ranking')
    expect(screen.getByTestId('search').textContent).toBe('?tab=ranking')
  })

  it('opens the tab named in ?tab', () => {
    renderAt('/community?tab=challenges')
    expect(selectedTab()).toBe('community.tab.challenges')
    expect(screen.getByTestId('challenges-page').dataset.embedded).toBe('true')
  })

  it('writes the tab into the URL and the back button returns to the previous one', async () => {
    const user = userEvent.setup()
    renderAt()
    await user.click(screen.getByRole('tab', { name: 'community.tab.ranking' }))
    expect(screen.getByTestId('search').textContent).toBe('?tab=ranking')
    expect(selectedTab()).toBe('community.tab.ranking')

    await user.click(screen.getByRole('button', { name: 'back' }))
    expect(screen.getByTestId('search').textContent).toBe('')
    expect(selectedTab()).toBe('community.tab.activity')
  })

  it('moves between tabs with the arrow keys', async () => {
    const user = userEvent.setup()
    renderAt()
    screen.getByRole('tab', { name: 'community.tab.activity' }).focus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByTestId('search').textContent).toBe('?tab=ranking')
  })

  it('does not load the full leaderboard on Activity, only when Ranking opens', async () => {
    const user = userEvent.setup()
    h.ranking = { followingCount: 2, top: [row('ana', 4, 1), row('me', 2, 2, true)], me: null }
    renderAt()
    expect(h.useLeaderboard).not.toHaveBeenCalled()

    await user.click(screen.getByRole('tab', { name: 'community.tab.ranking' }))
    expect(h.useLeaderboard).toHaveBeenCalled()
  })

  it('shows the empty state with Find friends when following nobody', () => {
    renderAt()
    expect(screen.getByTestId('community-empty')).toBeTruthy()
    // El reto destacado sigue ahí para unirse aunque no sigas a nadie.
    expect(screen.getByTestId('featured-challenge')).toBeTruthy()
    expect(screen.queryByTestId('friends-feed')).toBeNull()
  })

  it('shows friends activity, the weekly top 3 and my position when following people', () => {
    h.ranking = {
      followingCount: 3,
      top: [row('ana', 4, 1), row('dani', 3, 2), row('leo', 2, 3)],
      me: row('me', 1, 4, true),
    }
    h.feedItems = [{ id: 's1' }]
    renderAt()
    expect(screen.queryByTestId('community-empty')).toBeNull()
    expect(screen.getByTestId('friends-feed')).toBeTruthy()
    expect(screen.getByText('community.weeklyRanking')).toBeTruthy()
    // Mi fila va aparte con mi puesto real (4.º), no con el índice de la lista.
    expect(screen.getByText('leaderboard.you')).toBeTruthy()
    expect(screen.getAllByText('4')).toHaveLength(2) // puesto 4 + los 4 entrenos de Ana
  })

  it('does not flash the empty state while the ranking is loading', () => {
    h.rankingLoading = true
    renderAt()
    expect(screen.queryByTestId('community-empty')).toBeNull()
  })

  it('shows a retry notice, not the empty state, when the ranking fails to load', async () => {
    const user = userEvent.setup()
    h.rankingError = 'boom'
    h.feedItems = [{ id: 's1' }]
    renderAt()
    expect(screen.getByTestId('community-load-error')).toBeTruthy()
    expect(screen.queryByTestId('community-empty')).toBeNull()
    // El feed tiene su propia carga y se queda visible.
    expect(screen.getByTestId('friends-feed')).toBeTruthy()
    expect(screen.getByTestId('featured-challenge')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'community.retry' }))
    expect(h.reloadRanking).toHaveBeenCalledTimes(1)
  })

  it('does not claim nobody is followed nor "no friend activity" on error with an empty feed', () => {
    h.rankingError = 'boom'
    renderAt()
    expect(screen.getByTestId('community-load-error')).toBeTruthy()
    expect(screen.queryByTestId('community-empty')).toBeNull()
    expect(screen.queryByText('community.noFriendActivity')).toBeNull()
  })

  it('links to community programs, races and referrals', () => {
    renderAt()
    const hrefs = screen.getAllByRole('link').map(a => a.getAttribute('href'))
    expect(hrefs).toEqual(expect.arrayContaining(['/community-programs', '/races/discover', '/referrals']))
  })
})
