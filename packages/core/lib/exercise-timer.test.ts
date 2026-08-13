import { describe, expect, it } from 'vitest'

import {
  adjustTimerSeconds,
  canAdjustTimer,
  canTimerTransition,
  nextTimerPhase,
  TIMER_MIN_SECONDS,
  type TimerPhase,
} from './exercise-timer'

describe('nextTimerPhase', () => {
  it('arranca pasando por el prepárate, no directo a correr', () => {
    expect(nextTimerPhase('idle', 'start')).toBe('countdown')
    expect(nextTimerPhase('countdown', 'ready')).toBe('running')
  })

  it('recorre el ciclo pausar / reanudar / terminar', () => {
    expect(nextTimerPhase('running', 'pause')).toBe('paused')
    expect(nextTimerPhase('paused', 'resume')).toBe('running')
    expect(nextTimerPhase('running', 'complete')).toBe('done')
  })

  it('repetir vuelve al prepárate, no al crono en marcha', () => {
    expect(nextTimerPhase('done', 'repeat')).toBe('countdown')
  })

  it('cancelar durante el prepárate deshace, no pausa', () => {
    expect(nextTimerPhase('countdown', 'reset')).toBe('idle')
    expect(nextTimerPhase('countdown', 'pause')).toBe('countdown')
  })

  it('deja la fase intacta ante una acción que no aplica', () => {
    expect(nextTimerPhase('idle', 'pause')).toBe('idle')
    expect(nextTimerPhase('done', 'resume')).toBe('done')
    expect(nextTimerPhase('paused', 'complete')).toBe('paused')
  })

  it('desde cualquier fase se puede volver a cero salvo desde cero', () => {
    const phases: TimerPhase[] = ['countdown', 'running', 'paused', 'done']
    for (const phase of phases) expect(nextTimerPhase(phase, 'reset')).toBe('idle')
    expect(canTimerTransition('idle', 'reset')).toBe(false)
  })
})

describe('canAdjustTimer', () => {
  it('solo con el crono parado', () => {
    expect(canAdjustTimer('idle')).toBe(true)
    expect(canAdjustTimer('paused')).toBe(true)
    expect(canAdjustTimer('running')).toBe(false)
    expect(canAdjustTimer('countdown')).toBe(false)
    expect(canAdjustTimer('done')).toBe(false)
  })
})

describe('adjustTimerSeconds', () => {
  it('mueve total y restante a la vez', () => {
    expect(adjustTimerSeconds({ totalSeconds: 30, remainingSeconds: 30 }, 15))
      .toEqual({ totalSeconds: 45, remainingSeconds: 45 })
  })

  it('el restante nunca supera el total nuevo', () => {
    // Pausado en 28 de 30: subir el total a 45 no debe devolver 43 de restante.
    expect(adjustTimerSeconds({ totalSeconds: 30, remainingSeconds: 28 }, 15))
      .toEqual({ totalSeconds: 45, remainingSeconds: 43 })
    expect(adjustTimerSeconds({ totalSeconds: 30, remainingSeconds: 30 }, 15).remainingSeconds)
      .toBeLessThanOrEqual(45)
  })

  it('no baja del mínimo ni deja el restante en cero', () => {
    expect(adjustTimerSeconds({ totalSeconds: 10, remainingSeconds: 10 }, -15))
      .toEqual({ totalSeconds: TIMER_MIN_SECONDS, remainingSeconds: 1 })
  })

  it('acepta un mínimo distinto', () => {
    expect(adjustTimerSeconds({ totalSeconds: 30, remainingSeconds: 30 }, -25, 10).totalSeconds).toBe(10)
  })
})
