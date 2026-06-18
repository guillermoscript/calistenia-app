import { View } from 'react-native'
import { cn } from '@/lib/utils'

interface Props {
  step: number
  totalSteps: number
}

export function OnboardingProgress({ step, totalSteps }: Props) {
  return (
    <View className="flex-row justify-center gap-2 mb-8">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <View
          key={i}
          className={cn(
            'h-1.5 rounded-full',
            i === step ? 'w-8 bg-lime' : 'w-1.5 bg-muted-foreground/30'
          )}
        />
      ))}
    </View>
  )
}
