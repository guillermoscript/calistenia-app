import { useEffect } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { captureReferralCode } from '@calistenia/core/hooks/useAuth'
import { pb } from '@calistenia/core/lib/pocketbase'
import {
  CANONICAL_ANALYTICS_EVENTS,
  trackCanonicalEvent,
} from '@calistenia/core/lib/analytics'

/** Captura la atribución del enlace universal antes de entrar al registro. */
export default function InviteLinkScreen() {
  const { code } = useLocalSearchParams<{ code?: string | string[] }>()
  const router = useRouter()

  useEffect(() => {
    const referralCode = Array.isArray(code) ? code[0] : code

    if (pb.authStore.isValid) {
      router.replace('/(tabs)')
      return
    }

    if (referralCode) {
      captureReferralCode(referralCode)
      // La web ya emitía este evento en InviteLandingPage; en nativo la ruta
      // redirigía sin emitirlo, así que el embudo perdía el paso «opened».
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.inviteLandingViewed, {
        surface: 'invite_landing',
        source: 'referral_link',
        result: 'viewed',
        code: referralCode,
        platform: 'mobile',
      })
    }
    router.replace({ pathname: '/login', params: { mode: 'signup' } })
  }, [code, router])

  return null
}
