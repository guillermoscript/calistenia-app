import { cn } from '../../lib/utils'

interface Props {
  step: number
  totalSteps: number
}

export function OnboardingProgress({ step, totalSteps }: Props) {
  return (
    <div className="flex justify-center gap-2 mb-8">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all duration-300',
            i === step ? 'w-8 bg-[hsl(var(--lime))]' : 'w-1.5 bg-muted-foreground/30'
          )}
        />
      ))}
    </div>
  )
}
