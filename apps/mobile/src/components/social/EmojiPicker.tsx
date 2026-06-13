/** Fila de 5 botones de reacción con emoji — sin estado interno. */
import { View, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { REACTION_EMOJIS } from '@calistenia/core/hooks/useReactions'
import type { EmojiReactions } from '@calistenia/core/hooks/useReactions'

interface EmojiPickerProps {
  reactions: EmojiReactions
  onToggle: (emoji: string) => void
}

const EMOJI_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  '🔥': { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  '💪': { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  '👏': { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  '🎯': { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
  '🏆': { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
}

export function EmojiPicker({ reactions, onToggle }: EmojiPickerProps) {
  return (
    <View className="flex-row gap-1.5">
      {REACTION_EMOJIS.map((emoji) => {
        const data = reactions[emoji]
        const hasReacted = data?.hasReacted || false
        const count = data?.count || 0
        const colors = EMOJI_COLORS[emoji]

        return (
          <Pressable
            key={emoji}
            onPress={() => onToggle(emoji)}
            className={cn(
              'flex-row items-center gap-1 rounded-full border px-2.5 py-1 min-h-8 active:opacity-70',
              hasReacted && colors
                ? cn(colors.bg, colors.border)
                : 'border-transparent',
            )}
          >
            <Text className="text-base leading-none">{emoji}</Text>
            {count > 0 && (
              <Text
                className={cn(
                  'font-mono text-xs',
                  hasReacted && colors ? colors.text : 'text-muted-foreground',
                )}
              >
                {String(count)}
              </Text>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}
