import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ExerciseStat } from '@calistenia/core/lib/training-stats'
import { relativeDate } from '@calistenia/core/lib/dateUtils'
import { Card, CardContent } from '../../ui/card'
import { Kicker } from '../../ui/kicker'
import { cn } from '../../../lib/utils'

interface ExerciseRankingProps {
  exercises: ExerciseStat[]
  unknownExerciseSets: number
}

const TOP_N = 10

/** Ranking de ejercicios top 10; cada fila expande en línea al pulsarla. */
export default function ExerciseRanking({ exercises, unknownExerciseSets }: ExerciseRankingProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<string | null>(null)
  const top = exercises.slice(0, TOP_N)

  if (top.length === 0 && unknownExerciseSets === 0) return null

  return (
    <div>
      <Kicker className="mb-4">{t('stats.topExercises')}</Kicker>
      <Card>
        <CardContent className="p-0">
          {top.length > 0 ? (
            <div className="divide-y divide-border">
              {top.map(ex => {
                const isOpen = expanded === ex.key
                return (
                  <div key={ex.key}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : ex.key)}
                      className="w-full px-4 py-3 flex items-center justify-between text-left transition-colors hover:bg-muted/30"
                    >
                      <div className="font-medium text-sm truncate pr-3">{ex.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {t('stats.exerciseMeta', { sessions: ex.sessions, sets: ex.sets, reps: ex.reps })}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-3 text-[11px] text-muted-foreground space-y-1">
                        {ex.best && (
                          <div>
                            {ex.best.kind === 'reps'
                              ? t('stats.bestReps', { reps: ex.best.reps })
                              : t('stats.bestWeight', { weight: ex.best.weight, reps: ex.best.reps, e1rm: ex.best.e1rm })}
                          </div>
                        )}
                        <div>{t('stats.lastTime', { date: relativeDate(ex.lastDate) })}</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className={cn('text-sm text-muted-foreground p-5')}>{t('progress.noChartsData')}</div>
          )}
          {unknownExerciseSets > 0 && (
            <div className="text-[11px] text-muted-foreground font-mono px-4 py-3 border-t border-border/60">
              {t('stats.unknownExercises', { count: unknownExerciseSets })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
