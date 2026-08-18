import { cn } from '../../lib/utils'
import { REACTION_EMOJIS } from '@calistenia/core/hooks/useReactions'
import { REACTION_EMOJI_COLORS, getEmojiReactionState } from '@calistenia/core/lib/emoji-picker'

interface EmojiPickerProps {
  reactions: Record<string, { count: number; hasReacted: boolean }>
  onToggle: (emoji: string) => void
}

export function EmojiPicker({ reactions, onToggle }: EmojiPickerProps) {
  return (
    <div className="flex flex-row gap-1.5">
      {REACTION_EMOJIS.map((emoji) => {
        const { hasReacted, count } = getEmojiReactionState(reactions, emoji)
        const colors = REACTION_EMOJI_COLORS[emoji]

        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggle(emoji)}
            className={cn(
              'inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-all active:scale-95',
              hasReacted && colors
                ? cn(colors.bg, colors.text, colors.border)
                : 'border-transparent text-muted-foreground hover:bg-card hover:border-border'
            )}
          >
            <span className="text-base leading-none">{emoji}</span>
            {count > 0 && (
              <span className="text-xs font-medium tabular-nums">{count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
