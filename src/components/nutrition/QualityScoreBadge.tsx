import type { QualityScore } from '../../types'

const SCORE_COLORS: Record<QualityScore, string> = {
  A: 'bg-green-500 text-white',
  B: 'bg-lime-500 text-white',
  C: 'bg-yellow-500 text-black',
  D: 'bg-orange-500 text-white',
  E: 'bg-red-500 text-white',
}

const SCORE_BORDER_COLORS: Record<QualityScore, string> = {
  A: 'border-green-500/30',
  B: 'border-lime-500/30',
  C: 'border-yellow-500/30',
  D: 'border-orange-500/30',
  E: 'border-red-500/30',
}

const SIZES = {
  sm: 'size-5 text-[10px]',
  md: 'size-7 text-xs',
  lg: 'size-10 text-base',
} as const

interface QualityScoreBadgeProps {
  score?: QualityScore
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  onClick?: () => void
}

export function QualityScoreBadge({ score, size = 'sm', loading, onClick }: QualityScoreBadgeProps) {
  if (loading) {
    return (
      <span className={`${SIZES[size]} rounded-full bg-muted border border-muted-foreground/20 inline-flex items-center justify-center animate-pulse`}>
        <span className="size-2 rounded-full bg-muted-foreground/40" />
      </span>
    )
  }

  if (!score) return null

  return (
    <span
      className={`${SIZES[size]} ${SCORE_COLORS[score]} rounded-full inline-flex items-center justify-center font-bold leading-none border ${SCORE_BORDER_COLORS[score]} ${onClick ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
      onClick={onClick}
    >
      {score}
    </span>
  )
}

export { SCORE_COLORS, SCORE_BORDER_COLORS }
