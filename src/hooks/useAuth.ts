import { useState, useEffect, useCallback } from 'react'
import { RecordModel } from 'pocketbase'
import { pb, login, register, loginWithOAuth2, logout, tryRefreshAuth, getCurrentUser } from '../lib/pocketbase'
import type { RegisterData } from '../lib/pocketbase'
import type { UserRole, UserTier } from '../types'

interface UseAuthReturn {
  user: RecordModel | null
  authReady: boolean
  authError: string | null
  isLoading: boolean
  userRole: UserRole
  userTier: UserTier
  isAdmin: boolean
  isEditor: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (data: RegisterData) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => void
}

/**
 * useAuth — gestiona el ciclo completo de autenticación.
 *
 * Retorna:
 *   user        — registro del usuario autenticado (null si no hay sesión)
 *   authReady   — true cuando el arranque terminó (token verificado o limpiado)
 *   authError   — string con el último error de auth, o null
 *   isLoading   — true mientras hay una operación en curso
 *   signIn(email, password)
 *   signUp(email, password, displayName)
 *   signOut()
 */
export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<RecordModel | null>(getCurrentUser)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // ── Arranque: intentar refrescar token existente ────────────────────────
  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      await tryRefreshAuth()
      if (!cancelled) {
        setUser(getCurrentUser())
        setAuthReady(true)
      }
    }
    boot()
    return () => { cancelled = true }
  }, [])

  // ── Escuchar cambios del authStore (login/logout/token expirado) ─────────
  useEffect(() => {
    const unsub = pb.authStore.onChange((_token: string, record: RecordModel | null) => {
      setUser(record ?? null)
    })
    return () => unsub()
  }, [])

  // ── signIn ───────────────────────────────────────────────────────────────
  const signIn = useCallback(async (email: string, password: string) => {
    setAuthError(null)
    setIsLoading(true)
    try {
      await login(email, password)
      // onChange listener actualiza `user` automáticamente
    } catch (err: any) {
      const msg = err?.response?.message || err?.message || 'Error al iniciar sesión'
      setAuthError(
        err?.status === 400
          ? 'Email o contraseña incorrectos'
          : msg
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── signUp ───────────────────────────────────────────────────────────────
  const signUp = useCallback(async (data: RegisterData) => {
    setAuthError(null)
    setIsLoading(true)
    try {
      await register(data)
    } catch (err: any) {
      const d = err?.response?.data || {}
      if (d.email?.code === 'validation_not_unique') {
        setAuthError('Ya existe una cuenta con ese email')
      } else if (d.password?.message) {
        setAuthError(`Contraseña inválida: ${d.password.message}`)
      } else {
        setAuthError(err?.message || 'Error al crear la cuenta')
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── signInWithGoogle ───────────────────────────────────────────────────
  const signInWithGoogle = useCallback(async () => {
    setAuthError(null)
    setIsLoading(true)
    try {
      await loginWithOAuth2('google')
    } catch (err: any) {
      if (err?.isAbort) return // user closed popup
      setAuthError(err?.message || 'Error al iniciar sesión con Google')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── signOut ──────────────────────────────────────────────────────────────
  const signOut = useCallback(() => {
    logout()
    // onChange listener limpia `user` automáticamente
  }, [])

  const userRole: UserRole = (user?.role as UserRole) || 'user'
  const userTier: UserTier = (user?.tier as UserTier) || 'free'
  const isAdmin = userRole === 'admin'
  const isEditor = userRole === 'editor'

  return { user, authReady, authError, isLoading, userRole, userTier, isAdmin, isEditor, signIn, signUp, signInWithGoogle, signOut }
}
