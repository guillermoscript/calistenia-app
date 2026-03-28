import { useState, useEffect, useCallback, useRef } from 'react'
import { RecordModel } from 'pocketbase'
import { pb, loginWithOAuth2, logout, tryRefreshAuth, getCurrentUser } from '../lib/pocketbase'
import { setTimezone } from '../lib/dateUtils'
import { op } from '../lib/analytics'
import i18n from '../lib/i18n'
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
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>
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
        const u = getCurrentUser()
        if (u?.timezone) setTimezone(u.timezone)
        else setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
        if (u) {
          op.identify({ profileId: u.id, firstName: u.display_name || u.name || '', email: u.email, properties: { tier: u.tier || 'free', role: u.role || 'user' } })
        }
        setUser(u)
        setAuthReady(true)
      }
    }
    boot()
    return () => { cancelled = true }
  }, [])

  // ── Escuchar cambios del authStore (login/logout/token expirado) ─────────
  useEffect(() => {
    const unsub = pb.authStore.onChange((_token: string, record: RecordModel | null) => {
      if (record?.timezone) setTimezone(record.timezone)
      else if (record) setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
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
      op.identify({ profileId: user.id, firstName: user.display_name || user.name || '', email: user.email, properties: { tier: 'free', role: 'user' } })
      op.track('signup_completed', { method: user.email ? 'email' : 'google' })

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
        op.track('referral_converted', { referrer_id: referrer.id })
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
      setAuthError(err?.message || i18n.t('auth.googleError'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── signInWithEmail ──────────────────────────────────────────────────────
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setAuthError(null)
    setIsLoading(true)
    try {
      await pb.collection('users').authWithPassword(email, password)
    } catch (err: any) {
      setAuthError(err?.message || i18n.t('auth.loginError'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── signUpWithEmail ─────────────────────────────────────────────────────
  const signUpWithEmail = useCallback(async (email: string, password: string, displayName: string) => {
    setAuthError(null)
    setIsLoading(true)
    try {
      await pb.collection('users').create({
        email,
        password,
        passwordConfirm: password,
        display_name: displayName,
      })
      // Auto-login after signup
      const result = await pb.collection('users').authWithPassword(email, password)
      if (result.record && !result.record.referral_code) {
        justRegistered.current = true
      }
    } catch (err: any) {
      setAuthError(err?.message || i18n.t('auth.signupError'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── signOut ──────────────────────────────────────────────────────────────
  const signOut = useCallback(() => {
    op.clear()
    logout()
    // onChange listener limpia `user` automáticamente
  }, [])

  const userRole: UserRole = (user?.role as UserRole) || 'user'
  const userTier: UserTier = (user?.tier as UserTier) || 'free'
  const isAdmin = userRole === 'admin'
  const isEditor = userRole === 'editor'

  return { user, authReady, authError, isLoading, userRole, userTier, isAdmin, isEditor, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut }
}
