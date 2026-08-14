/**
 * La columna de trabajo del marcador de una batalla (#426).
 *
 * Vive aparte porque la misma cifra se pinta en cuatro sitios —clasificación en vivo,
 * resultado, historial y el resumen de "has terminado"— y hasta ahora cada uno repetía
 * las mismas dos columnas a mano. Repetido cuatro veces, olvidarse de los segundos en los
 * cuatro fue un solo descuido.
 *
 * Recibe primitivas, no el `score`: la fila de la clasificación está memoizada (#402) y un
 * objeto nuevo en cada tic del segundero la repintaría entera.
 */
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

/** El historial pinta más pequeño que el marcador en vivo. */
const SIZES = {
  sm: { value: 'text-[11px]', unit: 'text-[9px]' },
  md: { value: 'text-xs', unit: 'text-[10px]' },
} as const

interface BattleScoreCellProps {
  rounds: number
  reps: number
  seconds: number
  /** Qué unidades usa este circuito; sale de `battleWorkColumns(config)`. */
  showReps: boolean
  showSeconds: boolean
  size?: keyof typeof SIZES
  className?: string
}

export default function BattleScoreCell({
  rounds,
  reps,
  seconds,
  showReps,
  showSeconds,
  size = 'md',
  className,
}: BattleScoreCellProps) {
  const { t } = useTranslation()
  const style = SIZES[size]

  return (
    <Text className={cn('font-mono text-muted-foreground', style.value, className)}>
      {rounds}
      <Text className={style.unit}>{t('battle.roundsShort')}</Text>
      {showReps ? (
        <>
          {'  '}
          {reps}
          <Text className={style.unit}>{t('battle.repsShort')}</Text>
        </>
      ) : null}
      {showSeconds ? (
        <>
          {'  '}
          {seconds}
          <Text className={style.unit}>{t('battle.secondsShort')}</Text>
        </>
      ) : null}
    </Text>
  )
}
