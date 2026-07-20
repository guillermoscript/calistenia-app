import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// — Mocks hoisted: los usan las factories de vi.mock —
const { authRefreshMock, clearSpy, reportError } = vi.hoisted(() => ({
  authRefreshMock: vi.fn(),
  clearSpy: vi.fn(),
  reportError: vi.fn(),
}))

vi.mock('../platform', () => ({
  storage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  getEnv: () => ({ pbUrl: 'http://test.local', aiApiUrl: 'http://test.local', isDev: true }),
  getPlatform: () => ({ pbAuthStore: undefined, reportError }),
}))

// PocketBase falso: solo lo que evalúa el módulo (constructor + afterSend) y
// lo que tocan tryRefreshAuth/verifyAuth (authStore + collection().authRefresh).
vi.mock('pocketbase', () => {
  class FakePocketBase {
    authStore: {
      isValid: boolean
      token: string
      record: unknown
      model: unknown
      clear: () => void
      onChange: () => () => void
    }
    afterSend?: (response: Response, data: unknown) => unknown
    constructor() {
      this.authStore = {
        isValid: false,
        token: '',
        record: null,
        model: null,
        clear: () => {
          this.authStore.isValid = false
          clearSpy()
        },
        onChange: () => () => {},
      }
    }
    collection() {
      return { authRefresh: authRefreshMock }
    }
  }
  return { default: FakePocketBase }
})

import { pb, tryRefreshAuth, verifyAuth } from './pocketbase'

// El authStore real tipa isValid como readonly; el fake lo expone mutable.
const authStore = pb.authStore as unknown as { isValid: boolean }

const rejection = (status: number) => {
  const err: any = new Error(`status ${status}`)
  err.status = status
  return Promise.reject(err)
}

const fakeResponse = (status: number, url = 'http://test.local/api/collections/programs/records') =>
  ({ status, url }) as Response

// Reloj acumulativo: el debounce de verifyAuth es estado a nivel de módulo,
// así que cada test arranca 10 min después del anterior para salir de la ventana.
let clock = Date.now()

beforeEach(() => {
  vi.useFakeTimers()
  clock += 10 * 60_000
  vi.setSystemTime(clock)
  authStore.isValid = true
  authRefreshMock.mockReset().mockResolvedValue({})
  clearSpy.mockClear()
  reportError.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('tryRefreshAuth', () => {
  it('sin token local válido → false sin llamar al server', async () => {
    authStore.isValid = false
    expect(await tryRefreshAuth()).toBe(false)
    expect(authRefreshMock).not.toHaveBeenCalled()
  })

  it('token aceptado → true y conserva la sesión', async () => {
    expect(await tryRefreshAuth()).toBe(true)
    expect(clearSpy).not.toHaveBeenCalled()
  })

  it('error de red → conserva el token (no cerrar sesión offline)', async () => {
    authRefreshMock.mockImplementation(() => rejection(0))
    expect(await tryRefreshAuth()).toBe(true)
    expect(clearSpy).not.toHaveBeenCalled()
    expect(reportError).not.toHaveBeenCalled()
  })

  it('token rechazado por el server (401) → limpia authStore y reporta la pista', async () => {
    authRefreshMock.mockImplementation(() => rejection(401))
    expect(await tryRefreshAuth()).toBe(false)
    expect(clearSpy).toHaveBeenCalledOnce()
    expect(reportError).toHaveBeenCalledOnce()
  })
})

describe('verifyAuth (debounce)', () => {
  it('sin token local válido → false sin llamar al server', async () => {
    authStore.isValid = false
    expect(await verifyAuth()).toBe(false)
    expect(authRefreshMock).not.toHaveBeenCalled()
  })

  it('deduplica llamadas concurrentes', async () => {
    const [a, b] = await Promise.all([verifyAuth(), verifyAuth()])
    expect(a).toBe(true)
    expect(b).toBe(true)
    expect(authRefreshMock).toHaveBeenCalledOnce()
  })

  it('respeta el intervalo mínimo entre verificaciones', async () => {
    await verifyAuth()
    expect(authRefreshMock).toHaveBeenCalledOnce()
    // Dentro de la ventana: no vuelve a preguntar
    vi.setSystemTime(Date.now() + 10_000)
    expect(await verifyAuth()).toBe(true)
    expect(authRefreshMock).toHaveBeenCalledOnce()
    // Pasada la ventana: sí
    vi.setSystemTime(Date.now() + 31_000)
    await verifyAuth()
    expect(authRefreshMock).toHaveBeenCalledTimes(2)
  })
})

describe('pb.afterSend (interceptor global #254)', () => {
  it('devuelve data intacta', () => {
    const data = { items: [] }
    expect(pb.afterSend!(fakeResponse(200), data)).toBe(data)
  })

  it('401 con token local válido → limpia authStore y reporta', () => {
    pb.afterSend!(fakeResponse(401), {})
    expect(clearSpy).toHaveBeenCalledOnce()
    expect(reportError).toHaveBeenCalledOnce()
  })

  it('401 sin sesión local → no toca nada', () => {
    authStore.isValid = false
    pb.afterSend!(fakeResponse(401), {})
    expect(clearSpy).not.toHaveBeenCalled()
  })

  it('401 del propio auth-refresh → lo maneja tryRefreshAuth, no el interceptor', () => {
    pb.afterSend!(fakeResponse(401, 'http://test.local/api/collections/users/auth-refresh'), {})
    expect(clearSpy).not.toHaveBeenCalled()
  })

  it('400 con sesión fantasma → verifyAuth descubre el token muerto y limpia', async () => {
    authRefreshMock.mockImplementation(() => rejection(401))
    pb.afterSend!(fakeResponse(400), {})
    await vi.waitFor(() => expect(clearSpy).toHaveBeenCalledOnce())
    expect(authRefreshMock).toHaveBeenCalledOnce()
  })

  it('400 con token vivo (validación legítima) → verifica y conserva la sesión', async () => {
    pb.afterSend!(fakeResponse(400), {})
    await vi.waitFor(() => expect(authRefreshMock).toHaveBeenCalledOnce())
    expect(clearSpy).not.toHaveBeenCalled()
    expect(pb.authStore.isValid).toBe(true)
  })

  it('respuestas 2xx no disparan verificación', async () => {
    pb.afterSend!(fakeResponse(200), {})
    await Promise.resolve()
    expect(authRefreshMock).not.toHaveBeenCalled()
  })
})
