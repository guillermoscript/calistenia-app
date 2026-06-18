import { SafeAreaView } from 'react-native-safe-area-context'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'

export default function OnboardingScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <OnboardingFlow />
    </SafeAreaView>
  )
}
