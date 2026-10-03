/** La columna de trabajo del marcador (#426): rondas + las unidades que usa el circuito. */
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'

interface BattleScoreCellProps {
  rounds: number
  reps: number
  seconds: number
  /** Salen de `battleWorkColumns(config)`. */
  showReps: boolean
  showSeconds: boolean
  size?: 'sm' | 'md'
  className?: string
}

export default function BattleScoreCell({ rounds, reps, seconds, showReps, showSeconds, size = 'md', className }: BattleScoreCellProps) {
  const { t } = useTranslation()
  const unit = 'text-[10px]'
  return (
    <span className={cn('font-mono text-muted-foreground tabular-nums whitespace-pre', size === 'sm' ? 'text-[11px]' : 'text-xs', className)}>
      {rounds}<span className={unit}>{t('battle.roundsShort')}</span>
      {showReps ? <>{'  '}{reps}<span className={unit}>{t('battle.repsShort')}</span></> : null}
      {showSeconds ? <>{'  '}{seconds}<span className={unit}>{t('battle.secondsShort')}</span></> : null}
    </span>
  )
}
