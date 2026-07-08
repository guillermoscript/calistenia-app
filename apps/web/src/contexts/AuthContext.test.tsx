import { describe, it, expect, vi } from 'vitest'
import { render, screen, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'

// useAuth (core) habla con PocketBase — se mockea entero; aquí solo se prueba
// que el provider derive el estado/acciones correctamente.
const mockUseAuth = vi.fn()
vi.mock('@calistenia/core/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

import { AuthProvider, useAuthContext, useAuthState, useAuthActions } from './AuthContext'

const baseAuth = {
  user: null as { id: string } | null,
  authReady: true,
  authError: null,
  isLoading: false,
  userRole: 'user',
  userTier: 'free',
  isAdmin: false,
  isEditor: false,
  signInWithGoogle: vi.fn(),
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signOut: vi.fn(),
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

describe('AuthContext', () => {
  it('useAuthContext lanza si no hay AuthProvider', () => {
    // Silenciar el error de React por el throw en render
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAuthContext())).toThrow(
      'useAuthContext must be used within AuthProvider',
    )
    spy.mockRestore()
  })

  it('sin usuario: userId es null y flags en su valor por defecto', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth })
    const { result } = renderHook(() => useAuthState(), { wrapper })
    expect(result.current.user).toBeNull()
    expect(result.current.userId).toBeNull()
    expect(result.current.authReady).toBe(true)
    expect(result.current.isAdmin).toBe(false)
  })

  it('con usuario: deriva userId de user.id', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, user: { id: 'u123' } })
    const { result } = renderHook(() => useAuthState(), { wrapper })
    expect(result.current.userId).toBe('u123')
  })

  it('useAuthActions expone las 4 acciones de core', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth })
    const { result } = renderHook(() => useAuthActions(), { wrapper })
    result.current.signOut()
    expect(baseAuth.signOut).toHaveBeenCalled()
    expect(typeof result.current.signInWithGoogle).toBe('function')
    expect(typeof result.current.signInWithEmail).toBe('function')
    expect(typeof result.current.signUpWithEmail).toBe('function')
  })

  it('renderiza children (smoke de la infra RTL/jsdom)', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth })
    render(
      <AuthProvider>
        <p>hola infra</p>
      </AuthProvider>,
    )
    expect(screen.getByText('hola infra')).toBeInTheDocument()
  })
})
