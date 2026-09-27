/**
 * `useHomeStage` (#808): el tramo del inicio simplificado.
 *
 * El hook vive en `packages/core`, pero core corre en node sin testing-library;
 * aquí (jsdom) se puede montar. Lo que importa afirmar es el caso que motivó
 * el segundo contador: quien cambia de programa se queda con el contador del
 * programa a 0 y NO debe volver al inicio simple.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { homeFullKey } from '@calistenia/core/lib/activation'

const h = vi.hoisted(() => ({
  getList: vi.fn(),
  collection: vi.fn(),
}))

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    filter: (expr: string, params: Record<string, unknown>) => `${expr} ${JSON.stringify(params)}`,
    collection: (name: string) => {
      h.collection(name)
      return { getList: h.getList }
    },
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
    h.getList.mockReset()
    h.collection.mockReset()
  })

  it('cuenta las filas de `sessions` del usuario, sin filtro de programa', async () => {
    h.getList.mockResolvedValue({ totalItems: 0, items: [] })
    renderHook(() => useHomeStage('u1', 0), { wrapper })
    await waitFor(() => expect(h.getList).toHaveBeenCalled())
    expect(h.collection).toHaveBeenCalledWith('sessions')
    const [, , opts] = h.getList.mock.calls[0]
    expect(opts.filter).toContain('user = {:uid}')
    expect(opts.filter).not.toContain('program')
  })

  it('usuario nuevo: pending mientras carga, first en cuanto llega el 0', async () => {
    h.getList.mockResolvedValue({ totalItems: 0, items: [] })
    const { result } = renderHook(() => useHomeStage('u1', 0), { wrapper })
    expect(result.current).toEqual({ stage: 'first', sessions: 0, pending: true })
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.stage).toBe('first')
  })

  it('veterano recién cambiado de programa: el contador de la cuenta lo deja en full y se recuerda', async () => {
    h.getList.mockResolvedValue({ totalItems: 42, items: [] })
    const { result } = renderHook(() => useHomeStage('u1', 0), { wrapper })
    await waitFor(() => expect(result.current.stage).toBe('full'))
    expect(result.current.sessions).toBe(42)
    expect(window.localStorage.getItem(homeFullKey('u1'))).toBe('true')
  })

  it('si la petición falla se sigue con el contador del programa, sin quedarse en pending', async () => {
    h.getList.mockRejectedValue(Object.assign(new Error('boom'), { status: 0 }))
    const { result } = renderHook(() => useHomeStage('u1', 1), { wrapper })
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current).toEqual({ stage: 'early', sessions: 1, pending: false })
  })

  it('con el flag guardado es full desde el primer render, sin esperar a la red', () => {
    window.localStorage.setItem(homeFullKey('u1'), 'true')
    h.getList.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useHomeStage('u1', 0), { wrapper })
    expect(result.current).toEqual({ stage: 'full', sessions: 0, pending: false })
  })

  it('el flag es por usuario: el de otra cuenta del dispositivo no cuenta', () => {
    window.localStorage.setItem(homeFullKey('otra'), 'true')
    h.getList.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useHomeStage('u1', 0), { wrapper })
    expect(result.current.stage).toBe('first')
  })

  it('sin usuario no consulta nada ni se queda en pending', () => {
    const { result } = renderHook(() => useHomeStage(null, 0), { wrapper })
    expect(result.current).toEqual({ stage: 'first', sessions: 0, pending: false })
    expect(h.getList).not.toHaveBeenCalled()
  })
})
