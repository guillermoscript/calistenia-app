import { useState, useEffect, useCallback } from 'react'
import { pb, login, register, logout, tryRefreshAuth, getCurrentUser } from '../lib/pocketbase'

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
export const useAuth = () => {
  const [user, setUser] = useState(getCurrentUser)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState(null)
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
    const unsub = pb.authStore.onChange((token, record) => {
      setUser(record ?? null)
    })
    return () => unsub()
  }, [])

  // ── signIn ───────────────────────────────────────────────────────────────
  const signIn = useCallback(async (email, password) => {
    setAuthError(null)
    setIsLoading(true)
    try {
      await login(email, password)
      // onChange listener actualiza `user` automáticamente
    } catch (err) {
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
  const signUp = useCallback(async (email, password, displayName) => {
    setAuthError(null)
    setIsLoading(true)
    try {
      await register(email, password, displayName)
      // onChange listener actualiza `user` automáticamente
    } catch (err) {
      const data = err?.response?.data || {}
      if (data.email?.code === 'validation_not_unique') {
        setAuthError('Ya existe una cuenta con ese email')
      } else if (data.password?.message) {
        setAuthError(`Contraseña inválida: ${data.password.message}`)
      } else {
        setAuthError(err?.message || 'Error al crear la cuenta')
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── signOut ──────────────────────────────────────────────────────────────
  const signOut = useCallback(() => {
    logout()
    // onChange listener limpia `user` automáticamente
  }, [])

  return { user, authReady, authError, isLoading, signIn, signUp, signOut }
}
