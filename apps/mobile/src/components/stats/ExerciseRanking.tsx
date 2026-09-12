/** Top ejercicios: filas expandibles con mejor serie y última vez. */
import { memo, useCallback, useState } from 'react'
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Text } from '@/components/ui/text'
import { relativeDate } from '@calistenia/core/lib/dateUtils'
import type { ExerciseStat } from '@calistenia/core/lib/training-stats'

interface Props {
  exercises: ExerciseStat[]
}

const MAX_ROWS = 10

export function ExerciseRanking({ exercises }: Props) {
  const { t } = useTranslation()
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const toggle = useCallback((key: string) => {
    setExpandedKey((cur) => (cur === key ? null : key))
  }, [])

  const rows = exercises.slice(0, MAX_ROWS)
  if (rows.length === 0) return null

  return (
    <View className="gap-1">
      {rows.map((ex) => (
        <ExerciseRow key={ex.key} exercise={ex} expanded={expandedKey === ex.key} onToggle={toggle} t={t} />
      ))}
    </View>
  )
}

const ExerciseRow = memo(function ExerciseRow({
  exercise,
  expanded,
  onToggle,
  t,
}: {
  exercise: ExerciseStat
  expanded: boolean
  onToggle: (key: string) => void
  t: TFunction
}) {
  const handlePress = useCallback(() => onToggle(exercise.key), [onToggle, exercise.key])

  return (
    <Pressable onPress={handlePress} className="rounded-lg px-1 py-2 active:bg-muted/20">
      <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>
        {exercise.name}
      </Text>
      <Text className="font-mono text-[10px] text-muted-foreground">
        {exercise.isTimer
          ? t('stats.exerciseMetaTime', { sessions: exercise.sessions, sets: exercise.sets, seconds: exercise.seconds })
          : t('stats.exerciseMeta', { sessions: exercise.sessions, sets: exercise.sets, reps: exercise.reps })}
      </Text>
      {expanded ? (
        <View className="mt-1.5 gap-0.5 border-t border-border/40 pt-1.5">
          {exercise.best ? (
            <Text className="font-mono text-[10px] text-lime">
              {exercise.best.kind === 'reps'
                ? t('stats.bestReps', { reps: exercise.best.reps })
                : exercise.best.kind === 'time'
                  ? t('stats.bestTime', { seconds: exercise.best.seconds })
                  : t('stats.bestWeight', {
                      weight: exercise.best.weight,
                      reps: exercise.best.reps,
                      e1rm: exercise.best.e1rm,
                    })}
            </Text>
          ) : null}
          <Text className="font-mono text-[10px] text-muted-foreground">
            {t('stats.lastTime', { date: relativeDate(exercise.lastDate) })}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
})
