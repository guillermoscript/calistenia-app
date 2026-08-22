/**
 * Regresión de #578: `qk.leaderboard()` devolvía un array nuevo en cada render,
 * `load` (useCallback con `key` en deps) cambiaba de identidad y el
 * `useEffect([load])` de la página disparaba `leaderboard_viewed` +
 * `invalidateQueries` en cada render (~32 eventos cada 10 s en OpenPanel).
 *
 * Se comprueba con el hook real de core montado desde web (jsdom): `load`
 * conserva identidad entre renders y la página emite UN `leaderboard_viewed`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockTrack = vi.hoisted(() => vi.fn())
const getFullList = vi.hoisted(() => vi.fn())

vi.mock('@calistenia/core/lib/analytics', () => ({
  op: { track: mockTrack },
}))

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    baseUrl: 'http://pb.test',
    filter: (expr: string) => expr,
    collection: () => ({ getFullList, getOne: vi.fn(), getFirstListItem: vi.fn(), getList: vi.fn() }),
  },
  getUserAvatarUrl: () => null,
  isPocketBaseAvailable: () => Promise.resolve(true),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

import { useLeaderboard } from '@calistenia/core/hooks/useLeaderboard'
import LeaderboardPage from './LeaderboardPage'

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  mockTrack.mockClear()
  // Sin seguidos → la query devuelve EMPTY_ENTRIES sin más llamadas a PB.
  getFullList.mockResolvedValue([])
})

describe('useLeaderboard / LeaderboardPage (#578)', () => {
  it('load conserva identidad entre renders con los mismos inputs', async () => {
    const { result, rerender } = renderHook(() => useLeaderboard('user1'), { wrapper: makeWrapper() })
    const first = result.current.load
    rerender()
    expect(result.current.load).toBe(first)
    await waitFor(() => expect(result.current.loading).toBe(true))
    rerender()
    expect(result.current.load).toBe(first)
  })

  it('emite un único leaderboard_viewed por visita aunque la query cargue', async () => {
    const Wrapper = makeWrapper()
    const { rerender } = render(<Wrapper><LeaderboardPage userId="user1" /></Wrapper>)
    await waitFor(() => expect(getFullList).toHaveBeenCalled())
    rerender(<Wrapper><LeaderboardPage userId="user1" /></Wrapper>)
    await waitFor(() => expect(mockTrack).toHaveBeenCalledWith('leaderboard_viewed'))
    expect(mockTrack.mock.calls.filter(c => c[0] === 'leaderboard_viewed')).toHaveLength(1)
    expect(getFullList).toHaveBeenCalledTimes(1)
  })
})
