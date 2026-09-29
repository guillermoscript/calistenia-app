import { beforeEach, describe, expect, it } from 'vitest'
import {
  hasAccountTrained,
  isAnyOverlayOpen,
  resetOverlayGate,
  setAccountHasTrained,
  setOverlayOpen,
} from '../overlay-gate'

describe('overlay-gate', () => {
  beforeEach(() => resetOverlayGate())

  it('cuenta cada modal por su id', () => {
    expect(isAnyOverlayOpen()).toBe(false)
    setOverlayOpen('whats_new', true)
    setOverlayOpen('streak', true)
    setOverlayOpen('whats_new', false)
    expect(isAnyOverlayOpen()).toBe(true)
    setOverlayOpen('streak', false)
    expect(isAnyOverlayOpen()).toBe(false)
  })

  it('cerrar dos veces no deja el contador en negativo', () => {
    setOverlayOpen('streak', false)
    setOverlayOpen('streak', true)
    expect(isAnyOverlayOpen()).toBe(true)
  })

  it('la cuenta empieza sin entrenos hasta que el inicio lo publica', () => {
    expect(hasAccountTrained()).toBe(false)
    setAccountHasTrained(true)
    expect(hasAccountTrained()).toBe(true)
  })
})
