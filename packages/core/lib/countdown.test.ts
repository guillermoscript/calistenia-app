import { describe, expect, it } from 'vitest'

import {
  adjustCountdown,
  countdownCues,
  countdownProgress,
  formatCountdown,
  REST_CUE_THRESHOLDS,
  secondsLeft,
  TIMER_CUE_THRESHOLDS,
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
