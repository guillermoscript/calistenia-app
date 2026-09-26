/**
 * `useHomeStage` (#808): el tramo del inicio simplificado.
 *
 * El hook vive en `packages/core`, pero core corre en node sin testing-library;
 * aquí (jsdom) se puede montar. Lo que importa afirmar es el caso que motivó
 * leer `user_stats`: quien cambia de programa se queda con el contador del
 * programa a 0 y NO debe volver al inicio simple.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { homeFullKey } from '@calistenia/core/lib/activation'

const h = vi.hoisted(() => ({
  getFirstListItem: vi.fn(),
}))

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    filter: (expr: string) => expr,
    collection: () => ({ getFirstListItem: h.getFirstListItem }),
  },
}))

// `storage` de core exige initCore(); se respalda con el localStorage de jsdom.
vi.mock('@calistenia/core/platform', () => ({
  storage: {
    getItem: (k: string) => window.localStorage.getItem(k),
    setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
    removeItem: (k: string) => window.localStorage.removeItem(k),
  },
}))

import { useHomeStage } from '@calistenia/core/hooks/useHomeStage'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useHomeStage (#808)', () => {
  beforeEach(() => {
    h.getFirstListItem.mockReset()
  })

  it('usuario nuevo: first mientras carga y sigue first con el servidor a 0', async () => {
    h.getFirstListItem.mockResolvedValue({ total_sessions: 0 })
    const { result } = renderHook(() => useHomeStage('u1', 0), { wrapper })
    expect(result.current.stage).toBe('first')
    await waitFor(() => expect(h.getFirstListItem).toHaveBeenCalled())
    expect(result.current.stage).toBe('first')
  })

  it('sin fila de user_stats (404) cuenta como 0, no como error', async () => {
    h.getFirstListItem.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }))
    const { result } = renderHook(() => useHomeStage('u1', 1), { wrapper })
    await waitFor(() => expect(h.getFirstListItem).toHaveBeenCalled())
    expect(result.current).toEqual({ stage: 'early', sessions: 1 })
  })

  it('veterano recién cambiado de programa: el contador de la cuenta lo deja en full y se recuerda', async () => {
    h.getFirstListItem.mockResolvedValue({ total_sessions: 42 })
    const { result } = renderHook(() => useHomeStage('u1', 0), { wrapper })
    await waitFor(() => expect(result.current.stage).toBe('full'))
    expect(result.current.sessions).toBe(42)
    expect(window.localStorage.getItem(homeFullKey('u1'))).toBe('true')
  })

  it('con el flag guardado es full desde el primer render, sin esperar a la red', () => {
    window.localStorage.setItem(homeFullKey('u1'), 'true')
    h.getFirstListItem.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useHomeStage('u1', 0), { wrapper })
    expect(result.current.stage).toBe('full')
  })

  it('el flag es por usuario: el de otra cuenta del dispositivo no cuenta', () => {
    window.localStorage.setItem(homeFullKey('otra'), 'true')
    h.getFirstListItem.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useHomeStage('u1', 0), { wrapper })
    expect(result.current.stage).toBe('first')
  })

  it('sin usuario no consulta nada', () => {
    const { result } = renderHook(() => useHomeStage(null, 0), { wrapper })
    expect(result.current.stage).toBe('first')
    expect(h.getFirstListItem).not.toHaveBeenCalled()
  })
})
