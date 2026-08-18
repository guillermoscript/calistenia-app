import { useMemo } from 'react'
import { getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import { useAuthState } from '../contexts/AuthContext'

export interface SessionIdentity {
  userName?: string
  avatarUrl: string | null
  userId?: string
  referralCode: string | null
}

/**
 * Identidad del usuario para la celebración y las tarjetas de compartir.
 *
 * Antes bajaba como cuatro props desde `ActiveSessionPage` → `SessionView` →
 * `CelebrateScreen` → `PostWorkoutActions`, con el `AuthProvider` ya montado
 * por encima de todos ellos (#475). Las hojas la leen aquí, como ya hace la
 * app nativa con `useAuthUser()`.
 */
export function useSessionIdentity(): SessionIdentity {
  const { user } = useAuthState()
  return useMemo(() => ({
    userName: user?.display_name || user?.name || undefined,
    avatarUrl: user ? getUserAvatarUrl(user) : null,
    userId: user?.id || undefined,
    referralCode: user?.referral_code || null,
  }), [user])
}
