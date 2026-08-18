/** Fila de 5 botones de reacción con emoji — sin estado interno. */
import { View, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { REACTION_EMOJIS } from '@calistenia/core/hooks/useReactions'
import type { EmojiReactions } from '@calistenia/core/hooks/useReactions'
import { REACTION_EMOJI_COLORS, getEmojiReactionState } from '@calistenia/core/lib/emoji-picker'

interface EmojiPickerProps {
  reactions: EmojiReactions
  onToggle: (emoji: string) => void
}

export function EmojiPicker({ reactions, onToggle }: EmojiPickerProps) {
  return (
    <View className="flex-row gap-1.5">
      {REACTION_EMOJIS.map((emoji) => {
        const { hasReacted, count } = getEmojiReactionState(reactions, emoji)
        const colors = REACTION_EMOJI_COLORS[emoji]

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
