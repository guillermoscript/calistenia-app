/** Chip seleccionable (formularios de config). */
import { Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

interface ChipProps {
  label: string
  active: boolean
  onPress: () => void
  className?: string
}

export function Chip({ label, active, onPress, className }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-lg border px-3 py-2 active:opacity-70',
        active ? 'border-lime/50 bg-lime/10' : 'border-border bg-card',
        className,
      )}
    >
      <Text
        className={cn(
          'font-mono text-xs uppercase tracking-wide',
          active ? 'text-lime' : 'text-muted-foreground',
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}
