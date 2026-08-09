import { useEffect } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { captureReferralCode } from '@calistenia/core/hooks/useAuth'
import { pb } from '@calistenia/core/lib/pocketbase'

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

    if (referralCode) captureReferralCode(referralCode)
    router.replace({ pathname: '/login', params: { mode: 'signup' } })
  }, [code, router])

  return null
}
