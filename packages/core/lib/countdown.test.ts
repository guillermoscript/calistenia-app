import { describe, expect, it } from 'vitest'

import {
  adjustCountdown,
  countdownCues,
  countdownProgress,
  createCountdownRunner,
  formatCountdown,
  REST_CUE_THRESHOLDS,
  secondsLeft,
  TIMER_CUE_THRESHOLDS,
  type CountdownCue,
} from './countdown'

describe('secondsLeft', () => {
  it('redondea hacia arriba: quedan 2 s hasta que de verdad no queda nada', () => {
    expect(secondsLeft(10_000, 8_001)).toBe(2)
    expect(secondsLeft(10_000, 9_999)).toBe(1)
    expect(secondsLeft(10_000, 10_000)).toBe(0)
  })

  it('nunca es negativo aunque el fin haya pasado hace rato', () => {
    expect(secondsLeft(10_000, 90_000)).toBe(0)
  })
})

describe('countdownProgress', () => {
  it('es la fracción pendiente', () => {
    expect(countdownProgress(45, 90)).toBe(0.5)
    expect(countdownProgress(0, 90)).toBe(0)
  })

  it('se recorta a [0, 1] y tolera un total inválido', () => {
    expect(countdownProgress(120, 90)).toBe(1)
    expect(countdownProgress(-5, 90)).toBe(0)
    expect(countdownProgress(30, 0)).toBe(0)
  })
})

describe('formatCountdown', () => {
  it('escribe m:ss sin rellenar los minutos', () => {
    expect(formatCountdown(90)).toBe('1:30')
    expect(formatCountdown(5)).toBe('0:05')
    expect(formatCountdown(600)).toBe('10:00')
  })

  it('trata lo negativo como cero', () => {
    expect(formatCountdown(-3)).toBe('0:00')
  })
})

describe('countdownCues', () => {
  it('no emite nada si el segundo no ha cambiado', () => {
    expect(countdownCues(30, 30)).toEqual([])
  })

  it('avisa al cruzar el umbral, y solo al cruzarlo', () => {
    expect(countdownCues(11, 10)).toEqual(['warning'])
    expect(countdownCues(10, 9)).toEqual([])
    expect(countdownCues(12, 11)).toEqual([])
  })

  it('el temporizador avisa un segundo antes que el descanso', () => {
    expect(countdownCues(12, 11, TIMER_CUE_THRESHOLDS)).toEqual(['warning'])
    expect(countdownCues(12, 11, REST_CUE_THRESHOLDS)).toEqual([])
  })

  it('no avisa si el salto se lleva la cuenta directamente a cero', () => {
    expect(countdownCues(30, 0)).toEqual(['complete'])
  })

  it('hace tic en los tres últimos segundos, de uno en uno', () => {
    expect(countdownCues(4, 3)).toEqual(['tick'])
    expect(countdownCues(3, 2)).toEqual(['tick'])
    expect(countdownCues(2, 1)).toEqual(['tick'])
  })

  it('no suelta los tics de golpe cuando la cuenta pega un salto', () => {
    // Volver de segundo plano con la app dormida: 20 s → 2 s de una vez. El aviso sí
    // corresponde (se ha cruzado el umbral), pero los tics de 3, 2 y 1 no se acumulan.
    expect(countdownCues(20, 2)).toEqual(['warning'])
  })

  it('termina al llegar a cero, una sola vez', () => {
    expect(countdownCues(1, 0)).toEqual(['complete'])
    expect(countdownCues(0, 0)).toEqual([])
  })

  it('puede avisar y hacer tic en la misma frontera con umbrales pegados', () => {
    expect(countdownCues(4, 3, { warnAt: 3, tickFrom: 3 })).toEqual(['warning', 'tick'])
  })
})

describe('adjustCountdown', () => {
  const now = 1_000_000

  it('alarga el total y el final a la vez', () => {
    const next = adjustCountdown({ endAt: now + 30_000, totalSeconds: 90 }, 30, now)
    expect(next.totalSeconds).toBe(120)
    expect(next.endAt).toBe(now + 60_000)
  })

  it('acorta igual de bien', () => {
    const next = adjustCountdown({ endAt: now + 60_000, totalSeconds: 90 }, -15, now)
    expect(next.totalSeconds).toBe(75)
    expect(next.endAt).toBe(now + 45_000)
  })

  it('al tocar el mínimo deja de adelantar el final', () => {
    // El total ya está en el mínimo: restar otros 15 s no puede seguir comiéndose el
    // descanso, que era como el restante acababa por debajo del total.
    const next = adjustCountdown({ endAt: now + 10_000, totalSeconds: 10 }, -15, now)
    expect(next.totalSeconds).toBe(10)
    expect(next.endAt).toBe(now + 10_000)
  })

  it('aplica solo el trozo del delta que cabe hasta el mínimo', () => {
    const next = adjustCountdown({ endAt: now + 20_000, totalSeconds: 20 }, -15, now)
    expect(next.totalSeconds).toBe(10)
    expect(next.endAt).toBe(now + 10_000)
  })

  it('nunca deja el final en el pasado', () => {
    const next = adjustCountdown({ endAt: now + 2_000, totalSeconds: 60 }, -30, now)
    expect(next.totalSeconds).toBe(30)
    expect(next.endAt).toBe(now + 1_000)
  })

  it('respeta un mínimo distinto', () => {
    const next = adjustCountdown({ endAt: now + 6_000, totalSeconds: 6 }, -15, now, 5)
    expect(next.totalSeconds).toBe(5)
    expect(next.endAt).toBe(now + 5_000)
  })
})

/**
 * El intervalo real del descanso, simulado.
 *
 * Recorre una cuenta completa a la cadencia de verdad (un paso cada 250 ms) y devuelve
 * todas las señales que habrían sonado, con el segundo en que sonaron. Es lo más cerca
 * que se puede estar de probar el hook sin poder renderizar React en este repo.
 */
function runCountdown(
  runner: ReturnType<typeof createCountdownRunner>,
  endAt: number,
  fromMs: number,
  toMs: number,
  stepMs = 250,
): { cue: CountdownCue; at: number }[] {
  const fired: { cue: CountdownCue; at: number }[] = []
  for (let now = fromMs; now <= toMs; now += stepMs) {
    const step = runner.step(endAt, now)
    for (const cue of step.cues) fired.push({ cue, at: step.secondsLeft })
  }
  return fired
}

describe('createCountdownRunner — una cuenta de descanso completa', () => {
  const t0 = 1_000_000

  it('avisa una vez, hace tic en 3-2-1 y termina una vez', () => {
    const runner = createCountdownRunner(90)
    const fired = runCountdown(runner, t0 + 90_000, t0, t0 + 92_000)

    expect(fired).toEqual([
      { cue: 'warning', at: 10 },
      { cue: 'tick', at: 3 },
      { cue: 'tick', at: 2 },
      { cue: 'tick', at: 1 },
      { cue: 'complete', at: 0 },
    ])
  })

  it('no repite el fin aunque el intervalo siga latiendo', () => {
    const runner = createCountdownRunner(5)
    // Ocho segundos de más: el intervalo sigue vivo hasta que el componente se desmonta.
    const fired = runCountdown(runner, t0 + 5_000, t0, t0 + 13_000)
    expect(fired.filter((f) => f.cue === 'complete')).toHaveLength(1)
  })

  it('solo cambia el segundo mostrado una vez por segundo, no en cada tic', () => {
    const runner = createCountdownRunner(3)
    let changes = 0
    for (let now = t0; now <= t0 + 3_000; now += 250) {
      if (runner.step(t0 + 3_000, now).changed) changes += 1
    }
    // 3 → 2 → 1 → 0: tres fronteras en trece pasos del intervalo.
    expect(changes).toBe(3)
  })

  it('alargar el descanso tras el aviso NO lo vuelve a disparar', () => {
    // Comportamiento histórico del RestScreen: `hasPlayedWarning` no se rearmaba.
    const runner = createCountdownRunner(20)
    const first = runCountdown(runner, t0 + 20_000, t0, t0 + 12_000)
    expect(first.map((f) => f.cue)).toEqual(['warning'])

    // +30 s a los 12 s transcurridos: la cuenta sube y vuelve a cruzar el umbral.
    const extended = adjustCountdown({ endAt: t0 + 20_000, totalSeconds: 20 }, 30, t0 + 12_000)
    const second = runCountdown(runner, extended.endAt, t0 + 12_000, t0 + 52_000)
    expect(second.filter((f) => f.cue === 'warning')).toHaveLength(0)
    expect(second.filter((f) => f.cue === 'complete')).toHaveLength(1)
  })

  it('con warnOnce desactivado sí vuelve a avisar al recruzar', () => {
    const runner = createCountdownRunner(20, { warnOnce: false })
    runCountdown(runner, t0 + 20_000, t0, t0 + 12_000)
    const extended = adjustCountdown({ endAt: t0 + 20_000, totalSeconds: 20 }, 30, t0 + 12_000)
    const second = runCountdown(runner, extended.endAt, t0 + 12_000, t0 + 52_000)
    expect(second.filter((f) => f.cue === 'warning')).toHaveLength(1)
  })

  it('volver de segundo plano no suelta los tics atrasados de golpe', () => {
    const runner = createCountdownRunner(90)
    // La app duerme: el siguiente vistazo llega cuando ya solo quedan 2 s.
    const step = runner.step(t0 + 90_000, t0 + 88_000)
    expect(step.secondsLeft).toBe(2)
    expect(step.cues).toEqual(['warning'])
  })

  it('una cuenta que nace vencida termina en el primer vistazo', () => {
    const runner = createCountdownRunner(0)
    const step = runner.step(t0 - 5_000, t0)
    expect(step.cues).toEqual(['complete'])
    expect(step.changed).toBe(false)
  })

  it('reset rearma el aviso y el fin para el siguiente descanso', () => {
    const runner = createCountdownRunner(15)
    expect(runCountdown(runner, t0 + 15_000, t0, t0 + 16_000).map((f) => f.cue))
      .toEqual(['warning', 'tick', 'tick', 'tick', 'complete'])

    runner.reset(15)
    expect(runCountdown(runner, t0 + 100_000, t0 + 85_000, t0 + 101_000).map((f) => f.cue))
      .toEqual(['warning', 'tick', 'tick', 'tick', 'complete'])
  })

  it('el temporizador avisa a los 11 s, no a los 10', () => {
    const runner = createCountdownRunner(30, { thresholds: TIMER_CUE_THRESHOLDS })
    const fired = runCountdown(runner, t0 + 30_000, t0, t0 + 31_000)
    expect(fired[0]).toEqual({ cue: 'warning', at: 11 })
  })
})
