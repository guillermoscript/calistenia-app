/**
 * #636 §4 — la parte de ARRIBA del embudo de registro.
 *
 * Hasta ahora solo existían `signup_completed` y `login_completed`, así que no
 * había forma de saber cuánta gente lo INTENTA ni cuánta se queda por el
 * camino: un login que falla y un login que nadie intenta producían exactamente
 * los mismos datos (ninguno).
 *
 * Los eventos viven en `useAuth` de core, no en cada pantalla, para que web y
 * móvil los emitan por el mismo sitio. El hook solo se puede montar desde web
 * (jsdom), que es por lo que este test vive aquí.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { mockCanonical, authWithPassword, create, loginWithOAuth2 } = vi.hoisted(() => ({
  mockCanonical: vi.fn(),
  authWithPassword: vi.fn(),
  create: vi.fn(),
  loginWithOAuth2: vi.fn(),
}))

vi.mock('@calistenia/core/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@calistenia/core/lib/analytics')>()),
  op: { track: vi.fn(), identify: vi.fn(), clear: vi.fn() },
  trackCanonicalEvent: mockCanonical,
}))

vi.mock('@calistenia/core/platform', () => ({
  storage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() },
  lifecycle: { onForeground: vi.fn(() => vi.fn()), onBackground: vi.fn(() => vi.fn()) },
  getPlatform: () => ({ reportError: vi.fn(), analytics: { track: vi.fn(), identify: vi.fn(), clear: vi.fn() } }),
  getClientInfo: () => ({ version: '1.0.0', build: 0, platform: 'web' as const }),
}))

vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    collection: () => ({ authWithPassword, create }),
    authStore: { isValid: false, record: null, model: null, onChange: vi.fn(() => vi.fn()) },
  },
  getCurrentUser: () => null,
  loginWithOAuth2,
  logout: vi.fn(),
  tryRefreshAuth: vi.fn(async () => null),
  verifyAuth: vi.fn(async () => null),
}))

vi.mock('@calistenia/core/lib/timezone-sync', () => ({ syncUserTimezone: vi.fn() }))

import { useAuth } from '@calistenia/core/hooks/useAuth'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

/** Nombres de eventos canónicos emitidos, en orden. */
function emitted() {
  return mockCanonical.mock.calls.map(c => c[0])
}

beforeEach(() => { vi.clearAllMocks() })

describe('embudo de registro y acceso (#636 §4)', () => {
  it('un login con email fallido emite el intento Y el fallo', async () => {
    authWithPassword.mockRejectedValueOnce(Object.assign(new Error('bad'), { status: 400 }))
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => { await result.current.signInWithEmail('a@x.test', 'nope') })

    expect(emitted()).toEqual(['login_started', 'login_failed'])
    expect(mockCanonical).toHaveBeenLastCalledWith('login_failed', expect.objectContaining({
      surface: 'auth', method: 'email', status: 400,
    }))
  })

  // El mensaje del error de PocketBase puede llevar el correo dentro, y §6
  // prohíbe que un correo salga en las propiedades de un evento.
  it('el fallo NO lleva el mensaje del error', async () => {
    authWithPassword.mockRejectedValueOnce(new Error('a@x.test no existe'))
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => { await result.current.signInWithEmail('a@x.test', 'nope') })

    const props = mockCanonical.mock.calls.find(c => c[0] === 'login_failed')![1]
    expect(props).not.toHaveProperty('message')
    expect(props).not.toHaveProperty('email')
  })

  it('un login correcto emite el intento y NINGÚN fallo', async () => {
    authWithPassword.mockResolvedValueOnce({ record: { id: 'u1', referral_code: 'ABC' } })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => { await result.current.signInWithEmail('a@x.test', 'ok') })

    expect(emitted()).toEqual(['login_started'])
  })

  it('un alta fallida emite el intento Y el fallo', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('taken'), { status: 400 }))
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => { await result.current.signUpWithEmail('a@x.test', 'pw', 'Ana') })

    expect(emitted()).toEqual(['signup_started', 'signup_failed'])
  })

  // Cerrar el diálogo de Google es una decisión del usuario, no un error:
  // contarlo hundiría la tasa de éxito con algo que no es un fallo.
  it('cancelar el OAuth de Google no cuenta como fallo', async () => {
    loginWithOAuth2.mockRejectedValueOnce({ isAbort: true })
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => { await result.current.signInWithGoogle() })

    expect(emitted()).toEqual(['login_started'])
  })
})
