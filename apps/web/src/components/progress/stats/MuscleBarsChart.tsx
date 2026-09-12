import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import { getMuscleGroupLabelKey } from '@calistenia/core/lib/muscles'
import type { MuscleStat } from '@calistenia/core/lib/training-stats'
import { Card, CardContent } from '../../ui/card'
import { Kicker } from '../../ui/kicker'

interface MuscleBarsChartProps {
  groups: MuscleStat[]
  unassignedSets: number
  /** Por defecto `stats.muscles` / `stats.musclesHint` — se usan otros en la pestaña Gráficas. */
  title?: ReactNode
  hint?: ReactNode
}

/**
 * Barras horizontales de series por grupo muscular. Sustituye a
 * el gráfico de músculos anterior (que sumaba series planificadas de un mapa
 * estático, no las registradas). Standalone: se usa aquí y en la pestaña Gráficas.
 */
export default function MuscleBarsChart({ groups, unassignedSets, title, hint }: MuscleBarsChartProps) {
  const { t } = useTranslation()

  if (groups.length === 0 && unassignedSets === 0) return null

  return (
    <div>
      <Kicker className="mb-4">{title ?? t('stats.muscles')}</Kicker>
      <Card>
        <CardContent className="p-5">
          {hint !== null && (
            <div className="text-[11px] text-muted-foreground mb-4">{hint ?? t('stats.musclesHint')}</div>
          )}
          {groups.length > 0 ? (
            <div className="space-y-2.5">
              {groups.map(g => (
                <div key={g.group}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[12px] text-foreground">{t(getMuscleGroupLabelKey(g.group))}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">{g.sets} {t('stats.sets').toLowerCase()}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-lime transition-all" style={{ width: `${g.share * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{t('progress.noChartsData')}</div>
          )}
          {unassignedSets > 0 && (
            <div className="text-[11px] text-muted-foreground font-mono mt-3 pt-3 border-t border-border/60">
              {t('stats.unassigned', { count: unassignedSets })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
