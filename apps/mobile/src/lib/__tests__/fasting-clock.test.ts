import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribeFastingClock, type FastingClockAppState } from '../fasting-clock'

function nativeLifecycle(initialState: string | null = 'active') {
  let listener: ((state: string) => void) | undefined
  const remove = vi.fn()
  const appState: FastingClockAppState = {
    currentState: initialState,
    addEventListener: vi.fn((_event, callback) => { listener = callback; return { remove } }),
  }
  return { appState, remove, emit: (state: string) => { listener?.(state) } }
}

describe('reloj nativo de ayunos', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-04T12:00:00Z')) })
  afterEach(() => { vi.useRealTimers() })

  it('emite tiempos absolutos cada segundo en primer plano', () => {
    const { appState } = nativeLifecycle()
    const onNow = vi.fn()
    const dispose = subscribeFastingClock(appState, onNow)
    expect(onNow).toHaveBeenLastCalledWith(Date.now())
    vi.advanceTimersByTime(2000)
    expect(onNow).toHaveBeenCalledTimes(3)
    expect(onNow).toHaveBeenLastCalledWith(Date.now())
    dispose()
  })

  it('pausa en segundo plano y recupera de inmediato la hora real al volver', () => {
    const { appState, emit } = nativeLifecycle()
    const onNow = vi.fn()
    const dispose = subscribeFastingClock(appState, onNow)
    emit('inactive')
    emit('background')
    expect(vi.getTimerCount()).toBe(0)
    onNow.mockClear()
    vi.advanceTimersByTime(3_600_000)
    expect(onNow).not.toHaveBeenCalled()
    emit('active')
    expect(onNow).toHaveBeenCalledExactlyOnceWith(Date.now())
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(onNow).toHaveBeenLastCalledWith(Date.now())
    dispose()
  })

  it.each(['background', null])('no inicia intervalos con estado inicial %s', state => {
    const { appState, emit } = nativeLifecycle(state)
    const onNow = vi.fn()
    const dispose = subscribeFastingClock(appState, onNow)
    vi.advanceTimersByTime(5000)
    expect(onNow).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    emit('active')
    expect(onNow).toHaveBeenCalledExactlyOnceWith(Date.now())
    expect(vi.getTimerCount()).toBe(1)
    dispose()
  })

  it('no duplica intervalos y desmontar limpia la suscripción sin permitir reinicios', () => {
    const { appState, emit, remove } = nativeLifecycle()
    const onNow = vi.fn()
    const dispose = subscribeFastingClock(appState, onNow)
    emit('active')
    emit('active')
    expect(vi.getTimerCount()).toBe(1)
    dispose()
    dispose()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    onNow.mockClear()
    emit('active')
    vi.advanceTimersByTime(5000)
    expect(onNow).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
