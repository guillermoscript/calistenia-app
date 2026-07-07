import { describe, it, expect, vi, beforeEach } from 'vitest'
import { storage } from '../platform'
import { isOnboardingDone, markOnboardingDone, resetOnboarding } from './onboarding-state'

vi.mock('../platform', () => ({
  storage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

describe('onboarding-state', () => {
  beforeEach(() => {
    vi.mocked(storage.getItem).mockReset()
    vi.mocked(storage.setItem).mockClear()
    vi.mocked(storage.removeItem).mockClear()
  })

  it('isOnboardingDone consulta la key namespaced por usuario', () => {
    vi.mocked(storage.getItem).mockReturnValue('true')
    expect(isOnboardingDone('u1')).toBe(true)
    expect(storage.getItem).toHaveBeenCalledWith('calistenia_onboarding_done_u1')
  })

  it('isOnboardingDone es false si no hay valor guardado o no es literalmente "true"', () => {
    vi.mocked(storage.getItem).mockReturnValue(null)
    expect(isOnboardingDone('u1')).toBe(false)
    vi.mocked(storage.getItem).mockReturnValue('false')
    expect(isOnboardingDone('u1')).toBe(false)
    vi.mocked(storage.getItem).mockReturnValue('1')
    expect(isOnboardingDone('u1')).toBe(false)
  })

  it('markOnboardingDone escribe "true" en la key del usuario', () => {
    markOnboardingDone('u2')
    expect(storage.setItem).toHaveBeenCalledWith('calistenia_onboarding_done_u2', 'true')
  })

  it('resetOnboarding borra la key del usuario', () => {
    resetOnboarding('u3')
    expect(storage.removeItem).toHaveBeenCalledWith('calistenia_onboarding_done_u3')
  })

  it('usuarios distintos usan keys distintas (sin fuga de estado entre cuentas)', () => {
    markOnboardingDone('a')
    markOnboardingDone('b')
    expect(storage.setItem).toHaveBeenNthCalledWith(1, 'calistenia_onboarding_done_a', 'true')
    expect(storage.setItem).toHaveBeenNthCalledWith(2, 'calistenia_onboarding_done_b', 'true')
  })
})
