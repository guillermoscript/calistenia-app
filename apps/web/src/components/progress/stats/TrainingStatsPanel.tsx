import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useTrainingStats } from '@calistenia/core/hooks/useTrainingStats'
import type { StatsPeriod } from '@calistenia/core/lib/training-stats'
import { useWorkoutState, useWorkoutActions } from '../../../contexts/WorkoutContext'
import { Card, CardContent } from '../../ui/card'
import { Kicker } from '../../ui/kicker'
import { Skeleton } from '../../ui/skeleton'
import { EmptyState } from '../../ui/empty-state'
import { Button } from '../../ui/button'
import PeriodSelector from './PeriodSelector'
import MuscleBarsChart from './MuscleBarsChart'
import BalanceBar from './BalanceBar'
import ExerciseRanking from './ExerciseRanking'
import RecordsList from './RecordsList'
import WeeklyBarsChart from './WeeklyBarsChart'
import WeekdayBarsChart from './WeekdayBarsChart'

function StatTile({ value, label, accent }: { value: number; label: string; accent?: string }) {
  return (
    <div className="text-center p-3 bg-muted/60 rounded-xl">
      <div className={`font-bebas text-2xl tabular-nums ${accent ?? ''}`}>{value}</div>
      <div className="text-[10px] font-mono tracking-widest text-muted-foreground">{label}</div>
    </div>
  )
}

/** Pestaña «Estadísticas»: mismas 5 secciones y mismo comportamiento que móvil. */
export default function TrainingStatsPanel() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { progress } = useWorkoutState()
  const { getWorkout } = useWorkoutActions()
  const [period, setPeriod] = useState<StatsPeriod>('3m')

  const { stats, ready } = useTrainingStats(progress, getWorkout, period)
  const isEmptyRange = ready && stats.totals.sessions === 0 && stats.totals.sets === 0
  // Sólo se calcula 'all' cuando hace falta decidir si ofrecer «Ver todo» — es barato pero no gratis.
  const { stats: allStats } = useTrainingStats(progress, getWorkout, isEmptyRange && period !== 'all' ? 'all' : period)
  const canWiden = isEmptyRange && period !== 'all' && (allStats.totals.sessions > 0 || allStats.totals.sets > 0)

  if (!ready) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }

  if (isEmptyRange) {
    return (
      <div>
        <PeriodSelector value={period} onChange={setPeriod} />
        <EmptyState
          icon="📊"
          title={t('stats.empty.title')}
          hint={canWiden ? t('stats.empty.bodyWiden') : t('stats.empty.body')}
          action={
            <Button
              variant="limeSolid"
              onClick={() => (canWiden ? setPeriod('all') : navigate('/'))}
            >
              {canWiden ? t('stats.empty.ctaWiden') : t('stats.empty.cta')}
            </Button>
          }
        />
      </div>
    )
  }

  const { totals, muscles, exercises, records, weekly, weekdays, unknownExerciseSets } = stats

  return (
    <div className="space-y-6">
      <PeriodSelector value={period} onChange={setPeriod} />

      {/* Totales */}
      <div>
        <Kicker className="mb-4">{t('stats.totals')}</Kicker>
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile value={totals.sessions} label={t('stats.sessions')} accent="text-lime" />
              <StatTile value={totals.sets} label={t('stats.sets')} />
              <StatTile value={totals.reps} label={t('stats.reps')} />
              <StatTile value={totals.minutes} label={t('stats.minutes')} accent="text-sky-500" />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-muted-foreground font-mono pt-1">
              <span>{t('stats.setsPerSession')}: <span className="text-foreground">{totals.avgSetsPerSession}</span></span>
              <span>{t('stats.minPerSession')}: <span className="text-foreground">{totals.avgMinutesPerSession}</span></span>
              {totals.volumeKg > 0 && (
                <span>{t('stats.volume')}: <span className="text-foreground">{totals.volumeKg} kg</span></span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Músculos + Balance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 [&>*]:mb-0">
        <MuscleBarsChart groups={muscles.groups} unassignedSets={muscles.unassignedSets} />
        {(muscles.groups.some(g => g.sets > 0) || muscles.balance.push + muscles.balance.pull + muscles.balance.legs + muscles.balance.core > 0) && (
          <div>
            <Kicker className="mb-4">{t('stats.balance')}</Kicker>
            <Card>
              <CardContent className="p-5">
                <BalanceBar balance={muscles.balance} />
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Ejercicios + Récords */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 [&>*]:mb-0">
        <ExerciseRanking exercises={exercises} unknownExerciseSets={unknownExerciseSets} />
        <RecordsList records={records} />
      </div>

      {/* Tendencia */}
      <div>
        <Kicker className="mb-4">{t('stats.trend')}</Kicker>
        <Card>
          <CardContent className="p-5 space-y-5">
            <div className="text-[11px] text-muted-foreground">{t('stats.trendHint')}</div>
            <WeeklyBarsChart weekly={weekly} />
            <WeekdayBarsChart weekdays={weekdays} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
