/** Horizontal progress bar for a single macro (protein / carbs / fat). */
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

interface MacroBarProps {
  label: string
  current: number
  target: number
  /** Tailwind bg color class, e.g. 'bg-sky-500' */
  color: string
}

export default function MacroBar({ label, current, target, color }: MacroBarProps) {
  const pct = target > 0 ? Math.min(current / target, 1) : 0
  const over = target > 0 && current > target

  return (
    <View className="gap-1">
      {/* Row: label + values */}
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {label}
        </Text>
        <Text
          className={cn(
            'font-mono text-[9px] tracking-widest',
            over ? 'text-red-400' : 'text-foreground',
          )}
        >
          {Math.round(current)} / {Math.round(target)} g
        </Text>
      </View>

      {/* Bar */}
      <View className="h-1.5 overflow-hidden rounded-full bg-muted/60">
        <View
          className={cn('h-full rounded-full', over ? 'bg-red-400' : color)}
          style={{ width: `${pct * 100}%` }}
        />
      </View>
    </View>
  )
}
