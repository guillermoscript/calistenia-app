/**
 * Auto-cierre de retos caducados (issue #451).
 *
 * Los tests de core corren en vitest/node sin testing-library, así que el hook
 * no se renderiza: se prueban las funciones puras que deciden qué se intenta
 * cerrar y si merece la pena invalidar la query — que es exactamente donde
 * vivía el bucle infinito.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../platform', () => ({
  storage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  getPlatform: () => ({
    connectivity: { isOnline: () => true, onOnline: () => () => {}, onChange: () => () => {} },
    reportError: vi.fn(),
  }),
}))

// El módulo importa `pb` al evaluarse, que exige initCore(); las funciones bajo
// test reciben sus escrituras por parámetro, así que basta un doble mínimo.
vi.mock('../lib/pocketbase', () => ({
  pb: { filter: vi.fn(), collection: vi.fn(() => ({})) },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

import { closeExpiredChallenges, pendingExpiries } from './useChallenges'

const forbidden = () => Object.assign(new Error('forbidden'), { status: 403 })

describe('pendingExpiries', () => {
  it('devuelve los ids que aún no se han intentado', () => {
    expect(pendingExpiries(['a', 'b', 'c'], new Set(['b']))).toEqual(['a', 'c'])
  })

  it('deduplica: dos participaciones del mismo reto no se cierran dos veces', () => {
    expect(pendingExpiries(['a', 'a', 'b'], new Set())).toEqual(['a', 'b'])
  })

  it('se queda vacío cuando todos están intentados — el caso que corta el bucle', () => {
    expect(pendingExpiries(['a', 'b'], new Set(['a', 'b']))).toEqual([])
  })
})

describe('closeExpiredChallenges', () => {
  it('NO pide refrescar cuando todas las escrituras dan 403 (#451)', async () => {
    const update = vi.fn().mockRejectedValue(forbidden())
    const onClosed = vi.fn()

    const closedAny = await closeExpiredChallenges(['a', 'b'], { update, onClosed })

    // El participante no creador no puede cerrar nada: invalidar aquí era lo
    // que reiniciaba fetch → efecto → invalidate para siempre.
    expect(closedAny).toBe(false)
    expect(update).toHaveBeenCalledTimes(2)
    expect(onClosed).not.toHaveBeenCalled()
  })

  it('pide refrescar si al menos una escritura funcionó', async () => {
    const update = vi.fn(async (id: string) => {
      if (id === 'ajeno') throw forbidden()
      return {}
    })
    const onClosed = vi.fn()

    const closedAny = await closeExpiredChallenges(['ajeno', 'mio'], { update, onClosed })

    expect(closedAny).toBe(true)
    // La analítica solo cuenta los retos que de verdad se cerraron.
    expect(onClosed.mock.calls.map(c => c[0])).toEqual(['mio'])
  })

  it('no reintenta un id ya intentado en la pasada siguiente', async () => {
    const attempted = new Set<string>()
    const update = vi.fn().mockRejectedValue(forbidden())

    const first = pendingExpiries(['a', 'b'], attempted)
    for (const id of first) attempted.add(id)
    await closeExpiredChallenges(first, { update })

    // Segundo fetch con los mismos retos caducados: nada que intentar.
    const second = pendingExpiries(['a', 'b'], attempted)
    expect(second).toEqual([])
    await closeExpiredChallenges(second, { update })

    expect(update).toHaveBeenCalledTimes(2)
  })

  it('devuelve al pool los ids no intentados cuando se cancela a mitad', async () => {
    const attempted = new Set(['a', 'b', 'c'])
    let cancelled = false
    const update = vi.fn(async () => { cancelled = true })

    const closedAny = await closeExpiredChallenges(['a', 'b', 'c'], {
      update,
      isCancelled: () => cancelled,
      release: (id) => { attempted.delete(id) },
    })

    // 'a' se escribió y disparó la cancelación; 'b' y 'c' vuelven al pool para
    // que un montaje posterior pueda intentarlos.
    expect(closedAny).toBe(true)
    expect(update).toHaveBeenCalledTimes(1)
    expect([...attempted]).toEqual(['a'])
  })

  it('no escribe nada si ya está cancelado antes de empezar', async () => {
    const update = vi.fn()
    const released: string[] = []

    const closedAny = await closeExpiredChallenges(['a', 'b'], {
      update,
      isCancelled: () => true,
      release: (id) => { released.push(id) },
    })

    expect(closedAny).toBe(false)
    expect(update).not.toHaveBeenCalled()
    expect(released).toEqual(['a', 'b'])
  })
})
