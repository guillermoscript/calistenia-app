import { useState, useEffect, useCallback, useRef } from 'react'
import { RecordModel } from 'pocketbase'
import { pb, loginWithOAuth2, logout, tryRefreshAuth, getCurrentUser } from '../lib/pocketbase'
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

  // Track whether this is a new user (first OAuth login) to trigger post-registration side effects
  const justRegistered = useRef(false)

  // ── Post-registration: generate referral code + track referral ──────────
  useEffect(() => {
    if (!justRegistered.current || !user) return
    justRegistered.current = false

    const postRegister = async () => {
      // Generate referral code for the new user
      const displayName = user.display_name || user.name || user.email?.split('@')[0] || 'USER'
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

        // Create referral record — server hook handles follows, points, and notifications
        await pb.collection('referrals').create({
          referrer: referrer.id,
          referred: user.id,
          source: 'quick_invite',
        })
      } catch { /* non-critical */ }
    }

    postRegister()
  }, [user])

  // ── signInWithGoogle ───────────────────────────────────────────────────
  const signInWithGoogle = useCallback(async () => {
    setAuthError(null)
    setIsLoading(true)
    try {
      const result = await loginWithOAuth2('google')
      // If this is a newly created user (no referral_code yet), trigger post-registration
      if (result.record && !result.record.referral_code) {
        justRegistered.current = true
      }
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

  return { user, authReady, authError, isLoading, userRole, userTier, isAdmin, isEditor, signInWithGoogle, signOut }
}
