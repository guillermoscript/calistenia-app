import type { battleResultView } from '@calistenia/core/lib/battle'

type ResultView = ReturnType<typeof battleResultView>

/** El titular se elige por estado y por cómo le fue a quien mira, no por el puesto. */
export function resultHeadlineKey(state: ResultView['state'], outcome: ResultView['outcome']): string {
  if (state === 'cancelled') return 'battle.cancelledTitle'
  if (state === 'expired') return 'battle.expiredTitle'
  if (state === 'no_result') return 'battle.finishedTitle'
  switch (outcome) {
    case 'won': return 'battle.wonTitle'
    case 'tied': return 'battle.tiedTitle'
    case 'solo': return 'battle.soloTitle'
    case 'left': return 'battle.youLeftTitle'
    default: return 'battle.finishedTitle'
  }
}
