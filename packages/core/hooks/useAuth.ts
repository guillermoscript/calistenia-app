import { storage, lifecycle } from '../platform'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RecordModel } from 'pocketbase'
import { pb, loginWithOAuth2, logout, tryRefreshAuth, verifyAuth, getCurrentUser } from '../lib/pocketbase'
import { setTimezone } from '../lib/dateUtils'
import { CANONICAL_ANALYTICS_EVENTS, op, trackCanonicalEvent } from '../lib/analytics'
import { syncUserTimezone } from '../lib/timezone-sync'
import { clearUserStorage } from '../lib/storage-keys'
import { qk } from '../lib/query-keys'
import i18n from 'i18next'
import type { AuthUser, UserRole, UserTier } from '../types'

const REFERRAL_CODE_KEY = 'calistenia_referral_code'
const EXPRESS_CHALLENGE_KEY = 'calistenia_express_challenge'

/** Save referral code from URL to localStorage so it survives the registration flow. */
export function captureReferralCode(code: string) {
  storage.setItem(REFERRAL_CODE_KEY, code)
}

/** Existing-account login must not leave attribution for a future user. */
export function discardCapturedReferralCode(): void {
  storage.removeItem(REFERRAL_CODE_KEY)
}

/** Get and clear stored referral code. */
function consumeReferralCode(): string | null {
  const code = storage.getItem(REFERRAL_CODE_KEY)
  if (code) storage.removeItem(REFERRAL_CODE_KEY)
  return code
}

/** Save the express-challenge id from an invite link so it survives auth (#313). */
export function captureChallengeId(challengeId: string) {
  storage.setItem(EXPRESS_CHALLENGE_KEY, challengeId)
}

/** Get and clear the stored express-challenge id. */
function consumeChallengeId(): string | null {
  const id = storage.getItem(EXPRESS_CHALLENGE_KEY)
  if (id) storage.removeItem(EXPRESS_CHALLENGE_KEY)
  return id
}

export async function completeNewUserRegistration(
  user: AuthUser,
  method: 'email' | 'google',
): Promise<void> {
  op.identify({ profileId: user.id, firstName: user.display_name || user.name || '', email: user.email, properties: { tier: 'free', role: 'user' } })
  op.track('signup_completed', { method })

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

  const referrerCode = consumeReferralCode()
  if (!referrerCode) return

  try {
    const referrerUsers = await pb.collection('users').getList(1, 1, {
      filter: pb.filter('referral_code = {:code}', { code: referrerCode }),
      $autoCancel: false,
    })
    if (referrerUsers.items.length === 0) return

    const referrer = referrerUsers.items[0]
    if (referrer.id === user.id) return

    await pb.collection('referrals').create({
      referrer: referrer.id,
      referred: user.id,
      source: 'quick_invite',
    })
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.referralConverted, {
      surface: 'referral',
      source: 'quick_invite',
      result: 'converted',
      referrer_id: referrer.id,
    })
  } catch { /* non-critical */ }
}

interface UseAuthReturn {
  user: AuthUser | null
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
export function useAuth(): UseAuthReturn {
  const qc = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(getCurrentUser)
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
          // Persistir la zona en el registro: el servidor la necesita para
          // enviar los recordatorios a la hora local correcta.
          void syncUserTimezone(u.id, u.timezone as string | undefined)
        }
        setUser(u)
        setAuthReady(true)
      }
    }
    boot()
    return () => { cancelled = true }
  }, [])

  // ── Revalidar el token al volver la app a primer plano ───────────────────
  // Un token invalidado con la app abierta no genera 401s (PB lo degrada a
  // invitado → listas vacías, #254); al volver a primer plano se re-comprueba
  // contra el server. Si el token murió, authStore se limpia y el listener
  // de abajo saca al usuario a la vista de invitado.
  //
  // Antes esto escuchaba `document.visibilitychange` a pelo, así que en nativo
  // (sin `document`) era un no-op SILENCIOSO y el token fantasma del #254 nunca
  // se revalidaba. Ahora va por el lifecycle de la plataforma (#482): web lo
  // resuelve con visibilitychange y RN con AppState.
  useEffect(() => lifecycle.onForeground(() => void verifyAuth().catch(() => {})), [])

  // ── Escuchar cambios del authStore (login/logout/token expirado) ─────────
  useEffect(() => {
    const unsub = pb.authStore.onChange((_token: string, record: RecordModel | null) => {
      if (record?.timezone) setTimezone(record.timezone)
      else if (record) setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
      // Login (incl. OAuth) / refresh: asegurar que el servidor conoce la zona.
      if (record) void syncUserTimezone(record.id, record.timezone as string | undefined)
      // Logout (propio o sincronizado desde otra pestaña vía storage event):
      // vaciar la caché de queries también AQUÍ, no solo en signOut(). Si otra
      // pestaña conserva en memoria las queries del usuario anterior, su
      // persister las re-escribe a localStorage y los datos del usuario A
      // quedan en disco durante la sesión del usuario B.
      if (!record) qc.clear()
      setUser(record ?? null)
    })
    return () => unsub()
  }, [qc])

  // Track whether this is a new user (first OAuth login) to trigger post-registration side effects
  const registrationMethod = useRef<'email' | 'google' | null>(null)

  // ── Post-registration: generate referral code + track referral ──────────
  useEffect(() => {
    if (!registrationMethod.current || !user) return
    const method = registrationMethod.current
    registrationMethod.current = null
    void completeNewUserRegistration(user, method)
  }, [user])

  // ── Auto-inscripción en reto express tras autenticarse (#313) ────────────
  // El link /invite/<code>/challenge/<id> guarda el id antes del registro o
  // login; al haber usuario se consume y se crea la participación propia (la
  // rule de challenge_participants solo permite auto-inscribirse, ver #261).
  useEffect(() => {
    if (!user) return
    const challengeId = consumeChallengeId()
    if (!challengeId) return

    const joinChallenge = async () => {
      try {
        const challenge = await pb.collection('challenges').getOne(challengeId, { $autoCancel: false })
        if (challenge.status !== 'active') return
        await pb.collection('challenge_participants').create({
          challenge: challengeId,
          user: user.id,
        }).catch(() => {}) // ya inscrito (índice único challenge+user)
        op.track('challenge_joined', { challenge_id: challengeId, source: 'invite' })
        qc.invalidateQueries({ queryKey: qk.challenges(user.id) })
      } catch { /* reto borrado o inaccesible: no bloquear el login */ }
    }
    joinChallenge()
  }, [user, qc])

  // ── signInWithGoogle ───────────────────────────────────────────────────
  const signInWithGoogle = useCallback(async () => {
    setAuthError(null)
    setIsLoading(true)
    try {
      const result = await loginWithOAuth2('google')
      // If this is a newly created user (no referral_code yet), trigger post-registration
      if (result.record && !result.record.referral_code) {
        registrationMethod.current = 'google'
      } else {
        discardCapturedReferralCode()
        op.track('login_completed', { method: 'google' })
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
      discardCapturedReferralCode()
      op.track('login_completed', { method: 'email' })
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
        registrationMethod.current = 'email'
      }
    } catch (err: any) {
      setAuthError(err?.message || i18n.t('auth.signupError'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── signOut ──────────────────────────────────────────────────────────────
  const signOut = useCallback(() => {
    // Captura el id ANTES de logout(): luego authStore queda vacío.
    const signedOutUserId = pb.authStore.record?.id ?? pb.authStore.model?.id
    op.clear()
    logout()
    // Limpia toda la caché de queries: evita que datos del usuario anterior
    // (nutrición, progreso, social…) persistan tras logout / cambio de cuenta.
    qc.clear()
    // Elimina las entradas de localStorage del usuario (offline-first hooks).
    clearUserStorage(signedOutUserId)
    // onChange listener limpia `user` automáticamente
  }, [qc])

  const userRole: UserRole = (user?.role as UserRole) || 'user'
  const userTier: UserTier = (user?.tier as UserTier) || 'free'
  const isAdmin = userRole === 'admin'
  const isEditor = userRole === 'editor'

  return { user, authReady, authError, isLoading, userRole, userTier, isAdmin, isEditor, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut }
}
