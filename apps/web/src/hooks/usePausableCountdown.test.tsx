/**
 * Lo que `usePausableCountdown` gana para poder ser el único temporizador de web (#469).
 *
 * El hook vive en `packages/core`, pero los tests de core corren en node sin
 * testing-library: no se puede montar allí. Aquí sí — web tiene jsdom — así que este es
 * el único sitio donde se puede afirmar el comportamiento nuevo.
 *
 * La aritmética pura (`countdownCues`, `adjustCountdown`) ya está cubierta en
 * `packages/core/lib/countdown.test.ts`; lo que se prueba aquí es lo que solo existe al
 * montar: que ajustar **no reinicia** la cuenta, que en pausa mueve el restante
 * congelado, y que `resetKey` sí reinicia. El reloj se inyecta por la opción `now`, así
 * que ningún test depende de la hora real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { usePausableCountdown } from '@calistenia/core/hooks/usePausableCountdown'

let clock = 0
const now = (): number => clock

function advance(ms: number): void {
  act(() => {
    clock += ms
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  clock = 1_000_000
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('usePausableCountdown', () => {
  it('descuenta contra el reloj, no contando ticks', () => {
    const { result } = renderHook(() => usePausableCountdown({ seconds: 90, now }))

    expect(result.current.secondsLeft).toBe(90)
    expect(result.current.isRunning).toBe(true)

    advance(10_000)
    expect(result.current.secondsLeft).toBe(80)
  })

  it('alargar en marcha suma al restante y al total, sin reiniciar', () => {
    const { result } = renderHook(() => usePausableCountdown({ seconds: 90, now }))

    advance(10_000)
    expect(result.current.secondsLeft).toBe(80)

    act(() => { result.current.adjust(15) })

    // Reiniciar habría dejado 105; alargar deja 95 y sube el total a 105.
    expect(result.current.secondsLeft).toBe(95)
    expect(result.current.totalSeconds).toBe(105)
  })

  it('devuelve el total resultante para poder guardarlo sin esperar al render', () => {
    const { result } = renderHook(() => usePausableCountdown({ seconds: 90, now }))

    let returned = 0
    act(() => { returned = result.current.adjust(30) })

    expect(returned).toBe(120)
    expect(result.current.totalSeconds).toBe(120)
  })

  it('acortar respeta el mínimo y nunca cierra la cuenta de golpe', () => {
    const { result } = renderHook(() =>
      usePausableCountdown({ seconds: 12, now, minTotalSeconds: 10 }),
    )

    advance(10_000)
    expect(result.current.secondsLeft).toBe(2)

    act(() => { result.current.adjust(-15) })

    expect(result.current.totalSeconds).toBe(10)
    // Solo se pudieron restar 2 s del total, y el final nunca cae por debajo de 1 s.
    expect(result.current.secondsLeft).toBe(1)
  })

  it('en pausa el ajuste mueve el restante congelado', () => {
    const { result } = renderHook(() =>
      usePausableCountdown({ seconds: 60, paused: true, now }),
    )

    expect(result.current.isRunning).toBe(false)

    act(() => { result.current.adjust(30) })

    expect(result.current.secondsLeft).toBe(90)
    expect(result.current.totalSeconds).toBe(90)

    advance(5_000)
    expect(result.current.secondsLeft).toBe(90)
  })

  it('pausar congela el restante y reanudar sigue por donde iba', () => {
    const { result, rerender } = renderHook(
      ({ paused }: { paused: boolean }) => usePausableCountdown({ seconds: 60, paused, now }),
      { initialProps: { paused: false } },
    )

    advance(10_000)
    expect(result.current.secondsLeft).toBe(50)

    rerender({ paused: true })
    advance(20_000)
    expect(result.current.secondsLeft).toBe(50)

    rerender({ paused: false })
    advance(5_000)
    expect(result.current.secondsLeft).toBe(45)
  })

  it('`resetKey` reinicia la cuenta con la misma duración', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }: { resetKey: number }) =>
        usePausableCountdown({ seconds: 60, resetKey, now }),
      { initialProps: { resetKey: 0 } },
    )

    advance(20_000)
    expect(result.current.secondsLeft).toBe(40)

    rerender({ resetKey: 1 })
    expect(result.current.secondsLeft).toBe(60)
  })

  it('`resetKey` devuelve también el total ajustado a la duración de partida', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }: { resetKey: number }) =>
        usePausableCountdown({ seconds: 60, resetKey, now }),
      { initialProps: { resetKey: 0 } },
    )

    act(() => { result.current.adjust(30) })
    expect(result.current.totalSeconds).toBe(90)

    rerender({ resetKey: 1 })
    expect(result.current.totalSeconds).toBe(60)
  })

  it('avisa, hace tic y termina una sola vez', () => {
    const onCue = vi.fn()
    const onComplete = vi.fn()
    renderHook(() =>
      usePausableCountdown({ seconds: 13, now, onCue, onComplete }),
    )

    advance(3_000) // 10 s restantes → aviso
    expect(onCue.mock.calls.map(c => c[0])).toEqual(['warning'])

    // Segundo a segundo: los tics solo salen si la cuenta baja de uno en uno (una
    // pestaña dormida que vuelve no debe soltarlos todos de golpe).
    for (let i = 0; i < 10; i++) advance(1_000)

    expect(onCue.mock.calls.map(c => c[0])).toEqual([
      'warning', 'tick', 'tick', 'tick', 'complete',
    ])
    expect(onComplete).toHaveBeenCalledTimes(1)

    advance(5_000)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('ajustar una cuenta ya terminada no la resucita', () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      usePausableCountdown({ seconds: 3, now, onComplete }),
    )

    advance(3_000)
    expect(result.current.secondsLeft).toBe(0)

    act(() => { result.current.adjust(30) })
    expect(result.current.secondsLeft).toBe(0)
    expect(result.current.isRunning).toBe(false)
  })
})
