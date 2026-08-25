/**
 * #636 §4 — el muro (#588) no medía ninguna interacción: ni verlo, ni
 * reaccionar, ni comentar. La feature entera era invisible en OpenPanel.
 *
 * Los dos eventos viven en los hooks compartidos de core, no en cada pantalla,
 * porque web y móvil llaman a los MISMOS wrappers. Se montan desde web (jsdom).
 *
 * Lo que de verdad se afirma aquí es lo que un informe leería mal si estuviera
 * flojo: que quitar una reacción no se cuenta como ponerla, y que el texto de
 * un comentario no sale nunca del dispositivo (§6).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { mockCanonical, create, getFullList } = vi.hoisted(() => ({
  mockCanonical: vi.fn(),
  create: vi.fn(),
  getFullList: vi.fn(async () => [] as unknown[]),
}))

vi.mock('@calistenia/core/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@calistenia/core/lib/analytics')>()),
  op: { track: vi.fn(), identify: vi.fn(), clear: vi.fn() },
  trackCanonicalEvent: mockCanonical,
}))

vi.mock('@calistenia/core/platform', () => ({
  storage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() },
  getPlatform: () => ({ reportError: vi.fn(), analytics: { track: vi.fn(), identify: vi.fn(), clear: vi.fn() } }),
  getClientInfo: () => ({ version: '1.0.0', build: 0, platform: 'web' as const }),
}))

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    filter: (expr: string) => expr,
    collection: () => ({ create, getFullList, getOne: vi.fn(), delete: vi.fn() }),
    authStore: { isValid: true, record: { id: 'me' } },
  },
  getCurrentUser: () => ({ id: 'me', display_name: 'Yo' }),
  getUserAvatarUrl: () => null,
  isPocketBaseAvailable: async () => true,
}))

import { useReactions } from '@calistenia/core/hooks/useReactions'
import { useComments } from '@calistenia/core/hooks/useComments'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function propsOf(event: string) {
  return mockCanonical.mock.calls.find(c => c[0] === event)?.[1] as Record<string, unknown> | undefined
}

beforeEach(() => { vi.clearAllMocks() })

describe('interacciones del muro (#636 §4)', () => {
  // Sin `result`, poner y quitar una reacción son el mismo evento y el informe
  // de «reacciones» crece cuando la gente las está QUITANDO.
  it('poner una reacción se distingue de quitarla', async () => {
    const { result } = renderHook(() => useReactions('me'), { wrapper })

    await act(async () => { await result.current.toggleReaction('s1', '💪', 'otro') })

    expect(propsOf('feed_reaction_toggled')).toMatchObject({
      surface: 'feed', emoji: '💪', result: 'added', own_post: false,
    })
  })

  it('reaccionar a un post propio se marca como tal', async () => {
    const { result } = renderHook(() => useReactions('me'), { wrapper })

    await act(async () => { await result.current.toggleReaction('s1', '🔥', 'me') })

    expect(propsOf('feed_reaction_toggled')).toMatchObject({ own_post: true })
  })

  it('un comentario emite su longitud pero NUNCA su texto', async () => {
    create.mockResolvedValueOnce({ id: 'c1', created: '2026-08-25T00:00:00Z' })
    const { result } = renderHook(() => useComments('me'), { wrapper })

    await act(async () => { await result.current.addComment('s1', '  hola muro  ', undefined, 'otro') })

    const props = propsOf('feed_comment_added')
    expect(props).toMatchObject({ surface: 'feed', is_reply: false, length: 9 })
    expect(JSON.stringify(props)).not.toContain('hola')
  })

  // Un comentario que no llega a crearse no es un comentario publicado.
  it('un comentario que falla no se cuenta', async () => {
    create.mockRejectedValueOnce(new Error('rate limited'))
    const { result } = renderHook(() => useComments('me'), { wrapper })

    await act(async () => { await result.current.addComment('s1', 'hola', undefined, 'otro') })

    expect(propsOf('feed_comment_added')).toBeUndefined()
  })
})
