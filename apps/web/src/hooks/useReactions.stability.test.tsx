/**
 * `getReactions` devuelve una referencia ESTABLE para una sesión sin reacciones
 * (issue #487).
 *
 * Antes devolvía `reactions[sessionId] || {}`: un objeto literal nuevo en cada
 * llamada. Como el feed pasa ese valor a la tarjeta (`<FeedCard reactions=… />`),
 * el `memo` de la tarjeta no servía de nada justo en el caso más común —una
 * publicación sin reacciones— y CADA fila se re-renderizaba en cada render del
 * feed.
 *
 * El hook vive en `packages/core`, y los tests de core corren en node sin
 * testing-library; aquí sí se puede montar (web tiene jsdom), así que este es el
 * único sitio donde se puede afirmar la identidad del valor devuelto.
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    filter: (expr: string) => expr,
    collection: () => ({ getFullList: async () => [] }),
    authStore: { model: null, isValid: false, onChange: () => () => {} },
  },
  isPocketBaseAvailable: async () => false,
}))

import { useReactions } from '@calistenia/core/hooks/useReactions'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useReactions.getReactions — estabilidad de referencia', () => {
  it('devuelve la MISMA referencia para una sesión sin reacciones', () => {
    const { result } = renderHook(() => useReactions('u1'), { wrapper })

    const a = result.current.getReactions('sesion-sin-reacciones')
    const b = result.current.getReactions('sesion-sin-reacciones')

    // La aserción real: `toBe`, no `toEqual`. Con `|| {}` esto fallaba mientras
    // que `toEqual` pasaba — que es justo por lo que el bug sobrevivía.
    expect(a).toBe(b)
    expect(a).toEqual({})
  })

  it('mantiene la referencia entre renders distintos del hook', () => {
    const { result, rerender } = renderHook(() => useReactions('u1'), { wrapper })

    const before = result.current.getReactions('s1')
    rerender()
    const after = result.current.getReactions('s1')

    expect(after).toBe(before)
  })

  it('comparte la misma referencia vacía entre sesiones distintas', () => {
    const { result } = renderHook(() => useReactions('u1'), { wrapper })

    expect(result.current.getReactions('s1')).toBe(result.current.getReactions('s2'))
  })
})
