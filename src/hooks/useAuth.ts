import { useState, useEffect, useCallback, useRef } from 'react'
import { RecordModel } from 'pocketbase'
import { pb, login, register, loginWithOAuth2, logout, tryRefreshAuth, getCurrentUser } from '../lib/pocketbase'
import type { RegisterData } from '../lib/pocketbase'
import type { UserRole, UserTier } from '../types'

const REFERRAL_CODE_KEY = 'calistenia_referral_code'

/** Save referral code from URL to localStorage so it survives the registration flow. */
export function captureReferralCode(code: string) {
  localStorage.setItem(REFERRAL_CODE_KEY, code)
}

/** Get and clear stored referral code. */
function consumeReferralCode(): string | null {
  const code = localStorage.getItem(REFERRAL_CODE_KEY)
  if (code) localStorage.removeItem(REFERRAL_CODE_KEY)
  return code
}

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

  // Track whether we just registered (to trigger post-registration side effects)
  const justRegistered = useRef(false)

  // ── Post-registration: generate referral code + track referral ──────────
  useEffect(() => {
    if (!justRegistered.current || !user) return
    justRegistered.current = false

    const postRegister = async () => {
      // Generate referral code for the new user
      const displayName = user.display_name || user.email?.split('@')[0] || 'USER'
      try {
        const sanitized = displayName
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .replace(/\s+/g, '-')
          .toUpperCase()
          .slice(0, 10) || 'USER'

        const hash = Array.from(crypto.getRandomValues(new Uint8Array(4)))
          .map((b: number) => b.toString(36).toUpperCase())
          .join('')
          .slice(0, 6)

        const code = `${sanitized}-${hash}`
        await pb.collection('users').update(user.id, { referral_code: code }).catch(() => {})
      } catch { /* non-critical */ }

      // Track referral if there's a stored referral code
      const referrerCode = consumeReferralCode()
      if (!referrerCode) return

      try {
        const referrerUsers = await pb.collection('users').getList(1, 1, {
          filter: pb.filter('referral_code = {:code}', { code: referrerCode }),
          $autoCancel: false,
        })
        if (referrerUsers.items.length === 0) return

        const referrer = referrerUsers.items[0]
        if (referrer.id === user.id) return // block self-referral

        await pb.collection('referrals').create({
          referrer: referrer.id,
          referred: user.id,
          source: 'quick_invite',
        })

        await pb.collection('point_transactions').create({
          user: referrer.id,
          amount: 100,
          type: 'referral_signup',
          reference_id: user.id,
          description: 'Referido se registró',
        })

        // Notify referrer
        await pb.collection('notifications').create({
          user: referrer.id,
          type: 'referral_signup',
          actor: user.id,
          reference_id: user.id,
          reference_type: 'user',
          read: false,
          data: { referredName: user.display_name || user.email?.split('@')[0] || '' },
        }).catch(() => {})
      } catch { /* non-critical */ }
    }

    postRegister()
  }, [user])

  // ── signUp ───────────────────────────────────────────────────────────────
  const signUp = useCallback(async (data: RegisterData) => {
    setAuthError(null)
    setIsLoading(true)
    try {
      justRegistered.current = true
      await register(data)
    } catch (err: any) {
      justRegistered.current = false
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
