/**
 * Regresión de #559: el historial de cardio salía vacío porque las consultas
 * concurrentes a `cardio_sessions` compartían la clave de auto-cancelación por
 * defecto del SDK (método+ruta) y se abortaban entre sí. En web era
 * determinista: `CardioSessionPage` lanza `getHistory(20)` y el fetch de stats
 * en el mismo efecto, así que la segunda mataba a la primera y se pintaba
 * «no hay sesiones» con datos en la base.
 *
 * Reusa el emulador de auto-cancelación de #536 (`pbAutoCancelStub`): si
 * alguien quita los `requestKey: null`, `stub.aborted` deja de estar vacío y
 * el historial vuelve a perder filas.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const pbStub = await vi.hoisted(async () => {
  const { createPbAutoCancelStub } = await import('../test/pbAutoCancelStub')
  return createPbAutoCancelStub()
})

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    baseUrl: 'http://pb.test',
    filter: (expr: string) => expr,
    collection: pbStub.collection,
  },
  isPocketBaseAvailable: () => Promise.resolve(true),
}))

vi.mock('../lib/i18n', () => ({
  default: { t: (key: string) => key },
}))

vi.mock('@calistenia/core/platform', () => ({
  storage: {
    getItem: (k: string) => window.localStorage.getItem(k),
    setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
    removeItem: (k: string) => window.localStorage.removeItem(k),
  },
  lifecycle: {
    isForeground: () => true,
    onForeground: () => () => {},
    onBackground: () => () => {},
  },
  getPlatform: () => ({ reportError: vi.fn() }),
}))

import { CardioSessionProvider, useCardioSessionContext } from './CardioSessionContext'
import { fetchCardioSessions } from '@calistenia/core/hooks/useCardioStats'
import type { CardioSession } from '@calistenia/core/types'

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <CardioSessionProvider userId="user1">{children}</CardioSessionProvider>
    </QueryClientProvider>
  )
}

function seedSessions() {
  pbStub.rows.cardio_sessions = [
    {
      id: 'sess_a', user: 'user1', activity_type: 'running',
      distance_km: 5, duration_seconds: 1800, avg_pace: 6,
      started_at: '2026-08-19 10:00:00.000Z', finished_at: '2026-08-19 10:30:00.000Z',
    },
    {
      id: 'sess_b', user: 'user1', activity_type: 'walking',
      distance_km: 2, duration_seconds: 1500, avg_pace: 12.5,
      started_at: '2026-08-18 09:00:00.000Z', finished_at: '2026-08-18 09:25:00.000Z',
    },
  ]
}

describe('cardio_sessions — auto-cancelación de PocketBase (#559)', () => {
  beforeEach(() => {
    pbStub.reset()
    seedSessions()
  })

  it('historial y stats concurrentes sobreviven los dos (nadie aborta a nadie)', async () => {
    const { result } = renderHook(() => useCardioSessionContext(), { wrapper: makeWrapper() })

    let history: CardioSession[] = []
    let stats: CardioSession[] = []
    await act(async () => {
      // La condición exacta de CardioSessionPage: las dos consultas a
      // cardio_sessions salen en el mismo tick.
      ;[history, stats] = await Promise.all([
        result.current.getHistory(20),
        fetchCardioSessions('user1'),
      ])
    })

    // El bug dejaba history = [] (la petición abortada se tragaba como «sin datos»).
    expect(history.map(s => s.id)).toEqual(['sess_a', 'sess_b'])
    expect(stats.map(s => s.id)).toEqual(['sess_a', 'sess_b'])
    expect(pbStub.aborted).toEqual([])
  })
})
