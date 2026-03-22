import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { type RecordModel } from 'pocketbase'
import { useAuth } from '../hooks/useAuth'
import type { UserRole, UserTier } from '../types'

// ── Context interface ───────────────────────────────────────────────────────

interface AuthState {
  user: RecordModel | null
  userId: string | null
  authReady: boolean
  authError: string | null
  isLoading: boolean
  userRole: UserRole
  userTier: UserTier
  isAdmin: boolean
  isEditor: boolean
}

interface AuthActions {
  signInWithGoogle: () => Promise<void>
  signOut: () => void
}

interface AuthContextValue {
  state: AuthState
  actions: AuthActions
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Hooks ───────────────────────────────────────────────────────────────────

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}

export function useAuthState() {
  return useAuthContext().state
}

export function useAuthActions() {
  return useAuthContext().actions
}

// ── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    user, authReady, authError, isLoading,
    userRole, userTier, isAdmin, isEditor,
    signInWithGoogle, signOut,
  } = useAuth()

  const state = useMemo<AuthState>(() => ({
    user,
    userId: user?.id ?? null,
    authReady,
    authError,
    isLoading,
    userRole,
    userTier,
    isAdmin,
    isEditor,
  }), [user, authReady, authError, isLoading, userRole, userTier, isAdmin, isEditor])

  const actions = useMemo<AuthActions>(() => ({
    signInWithGoogle, signOut,
  }), [signInWithGoogle, signOut])

  const value = useMemo(() => ({ state, actions }), [state, actions])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
