import { cn } from '../../lib/utils'
import { REACTION_EMOJIS } from '../../hooks/useReactions'

interface EmojiPickerProps {
  reactions: Record<string, { count: number; hasReacted: boolean }>
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
    <div className="flex flex-row gap-1.5">
      {REACTION_EMOJIS.map((emoji) => {
        const data = reactions[emoji]
        const hasReacted = data?.hasReacted || false
        const count = data?.count || 0
        const colors = EMOJI_COLORS[emoji]

        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggle(emoji)}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm transition-all active:scale-90',
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
