import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { makeOptimisticListHandlers } from './optimistic'

describe('makeOptimisticListHandlers', () => {
  let qc: QueryClient
  let lsWrite: ReturnType<typeof vi.fn>

  beforeEach(() => {
    qc = new QueryClient()
    lsWrite = vi.fn()
  })

  it('onMutate parte de la caché existente, aplica el updater y hace write-through a LS', async () => {
    const key = ['list', 'u1']
    qc.setQueryData(key, [1, 2, 3])
    const handlers = makeOptimisticListHandlers<number[], number>(
      qc, () => key, () => [], (curr, v) => [...curr, v], lsWrite,
    )
    const ctx = await handlers.onMutate(4)
    expect(ctx.prev).toEqual([1, 2, 3])
    expect(ctx.resolvedKey).toEqual(key)
    expect(qc.getQueryData(key)).toEqual([1, 2, 3, 4])
    expect(lsWrite).toHaveBeenCalledWith([1, 2, 3, 4])
  })

  it('onMutate usa getDefault() si no hay nada en caché', async () => {
    const key = ['list', 'nuevo']
    const handlers = makeOptimisticListHandlers<number[], number>(
      qc, () => key, () => [], (curr, v) => [...curr, v], lsWrite,
    )
    const ctx = await handlers.onMutate(1)
    expect(ctx.prev).toEqual([])
    expect(qc.getQueryData(key)).toEqual([1])
  })

  it('onError revierte la caché al prev y vuelve a escribirlo en localStorage', () => {
    const key = ['list', 'u1']
    const handlers = makeOptimisticListHandlers<number[], number>(
      qc, () => key, () => [], (curr, v) => [...curr, v], lsWrite,
    )
    qc.setQueryData(key, [1, 2, 9]) // estado optimista ya aplicado
    handlers.onError(new Error('fail'), 9, { prev: [1, 2], resolvedKey: key })
    expect(qc.getQueryData(key)).toEqual([1, 2])
    expect(lsWrite).toHaveBeenCalledWith([1, 2])
  })

  it('onError no hace nada si el contexto es undefined (onMutate falló antes de completar)', () => {
    const key = ['list', 'u1']
    const handlers = makeOptimisticListHandlers<number[], number>(
      qc, () => key, () => [], (curr, v) => [...curr, v], lsWrite,
    )
    qc.setQueryData(key, [1, 2, 9])
    handlers.onError(new Error('fail'), 9, undefined)
    expect(qc.getQueryData(key)).toEqual([1, 2, 9]) // sin cambios
    expect(lsWrite).not.toHaveBeenCalled()
  })

  it('usa el resolvedKey capturado en el contexto, no una key recalculada (evita revertir la clave equivocada)', () => {
    let currentUser = 'u1'
    const handlers = makeOptimisticListHandlers<number[], number>(
      qc, () => ['list', currentUser], () => [], (curr, v) => [...curr, v], lsWrite,
    )
    qc.setQueryData(['list', 'u1'], [1])
    qc.setQueryData(['list', 'u2'], [7])
    // el usuario (y por lo tanto el key del hook) cambió entre onMutate y onError
    currentUser = 'u2'
    handlers.onError(new Error('fail'), 1, { prev: [], resolvedKey: ['list', 'u1'] })
    // revierte 'list','u1' (la key resuelta al momento de mutar), no toca 'list','u2'
    expect(qc.getQueryData(['list', 'u1'])).toEqual([])
    expect(qc.getQueryData(['list', 'u2'])).toEqual([7])
  })

  it('OJO: onError NO revierte si ctx.prev es un valor "falsy" válido (p.ej. un contador en 0)', () => {
    // El guard `if (!ctx?.prev) return` en optimistic.ts trata 0 igual que
    // "sin contexto". Si un consumidor usa este helper para un valor escalar
    // que puede legítimamente ser 0 (o '' / false), el rollback se salta en
    // silencio y la caché se queda con el valor optimista tras un error.
    const key = ['counter', 'u1']
    const handlers = makeOptimisticListHandlers<number, number>(
      qc, () => key, () => 0, (curr, v) => curr + v, lsWrite,
    )
    qc.setQueryData(key, 5) // valor optimista aplicado
    handlers.onError(new Error('fail'), 5, { prev: 0, resolvedKey: key })
    expect(qc.getQueryData(key)).toBe(5) // no revirtió a 0
    expect(lsWrite).not.toHaveBeenCalled()
  })
})
