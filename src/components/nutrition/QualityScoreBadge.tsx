import type { QualityScore } from '../../types'
import { SCORE_COLORS, SCORE_BORDER_COLORS } from '../../lib/style-tokens'

const SCORE_LABELS: Record<QualityScore, string> = {
  A: 'Excelente',
  B: 'Bueno',
  C: 'Aceptable',
  D: 'Pobre',
  E: 'Malo',
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
  pending?: boolean
  onClick?: () => void
  'aria-expanded'?: boolean
}

export function QualityScoreBadge({ score, size = 'sm', loading, pending, onClick, 'aria-expanded': ariaExpanded }: QualityScoreBadgeProps) {
  if (loading) {
    return (
      <span className={`${SIZES[size]} rounded-full bg-muted border border-muted-foreground/20 inline-flex items-center justify-center shrink-0 motion-safe:animate-pulse`} aria-label="Cargando score">
        <span className="size-2 rounded-full bg-muted-foreground/40" />
      </span>
    )
  }

  if (!score && pending) {
    return (
      <span className={`${SIZES[size]} rounded-full bg-muted border border-muted-foreground/20 inline-flex items-center justify-center shrink-0 text-muted-foreground/50 font-bold leading-none`} aria-label="Score pendiente">
        ?
      </span>
    )
  }

  if (!score) return null

  const classes = `${SIZES[size]} ${SCORE_COLORS[score]} rounded-full inline-flex items-center justify-center font-bold leading-none border shrink-0 ${SCORE_BORDER_COLORS[score]}`
  const label = `Score ${score} — ${SCORE_LABELS[score]}`

  if (onClick) {
    return (
      <button
        type="button"
        className={`${classes} cursor-pointer active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
        onClick={onClick}
        aria-label={label}
        aria-expanded={ariaExpanded}
      >
        {score}
      </button>
    )
  }

  return (
    <span className={classes} aria-label={label}>
      {score}
    </span>
  )
}
