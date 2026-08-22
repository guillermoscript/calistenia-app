import { beforeEach, describe, expect, it, vi } from 'vitest'
import { op } from '../lib/analytics'
import { identifyUser, resetIdentifiedUser } from './useAuth'

vi.mock('../platform', () => ({
  storage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
  lifecycle: { onForeground: vi.fn(() => vi.fn()) },
}))
vi.mock('../lib/pocketbase', () => ({
  pb: { authStore: { onChange: vi.fn(() => vi.fn()) }, collection: vi.fn() },
  getCurrentUser: vi.fn(() => null),
  loginWithOAuth2: vi.fn(),
  logout: vi.fn(),
  tryRefreshAuth: vi.fn(),
  verifyAuth: vi.fn(),
}))
vi.mock('../lib/analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/analytics')>()
  return { ...actual, op: { track: vi.fn(), identify: vi.fn(), clear: vi.fn() }, trackCanonicalEvent: vi.fn() }
})

beforeEach(() => { vi.clearAllMocks(); resetIdentifiedUser() })

describe('identifyUser (usuarios anónimos en OpenPanel)', () => {
  it('manda profileId = id de PB con nombre, email y tier/role por defecto', () => {
    identifyUser({ id: 'u1', display_name: 'Ana', email: 'a@x.test' })
    expect(op.identify).toHaveBeenCalledWith({
      profileId: 'u1', firstName: 'Ana', email: 'a@x.test', properties: { tier: 'free', role: 'user' },
    })
  })

  it('es idempotente por id: un refresh de token no reenvía el identify', () => {
    identifyUser({ id: 'u1' })
    identifyUser({ id: 'u1' })
    expect(op.identify).toHaveBeenCalledTimes(1)
  })

  it('otro usuario (o el mismo tras logout) vuelve a identificarse', () => {
    identifyUser({ id: 'u1' })
    identifyUser({ id: 'u2' })
    resetIdentifiedUser()
    identifyUser({ id: 'u1' })
    expect(op.identify).toHaveBeenCalledTimes(3)
  })
})
