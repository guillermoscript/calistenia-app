import { Redirect } from 'expo-router'
import { pb } from '@calistenia/core/lib/pocketbase'
import { isOnboardingDone } from '@calistenia/core/lib/onboarding-state'

export default function Index() {
  if (!pb.authStore.isValid) return <Redirect href="/login" />
  const userId = pb.authStore.record?.id ?? pb.authStore.model?.id
  if (!userId || !isOnboardingDone(userId)) return <Redirect href="/onboarding" />
  return <Redirect href="/(tabs)" />
}
