/** Colores y estado derivado del picker de reacciones de emoji del feed (components/social/EmojiPicker.tsx en web y móvil). */
import type { EmojiReactions } from '../hooks/useReactions'

export interface EmojiColorClasses {
  bg: string
  text: string
  border: string
}

/** Clases de color por emoji (Tailwind/NativeWind) — mismas clases en web y móvil. */
export const REACTION_EMOJI_COLORS: Record<string, EmojiColorClasses> = {
  '🔥': { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  '💪': { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  '👏': { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  '🎯': { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
  '🏆': { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
}

/** Extrae `hasReacted`/`count` para un emoji dado, con los mismos valores por defecto que las dos copias de UI. */
export function getEmojiReactionState(
  reactions: EmojiReactions,
  emoji: string,
): { hasReacted: boolean; count: number } {
  const data = reactions[emoji]
  return { hasReacted: data?.hasReacted || false, count: data?.count || 0 }
}
