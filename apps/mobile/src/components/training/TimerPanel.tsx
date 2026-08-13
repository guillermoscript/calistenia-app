/**
 * Ejercicio por tiempo: anillo, "prepárate" 3-2-1, ±segundos y controles.
 *
 * Todo lo que recibe son primitivas y callbacks — la fase y los números los calcula
 * `useExerciseTimer`, que a su vez no sabe nada de píxeles. Así la misma pieza sirve
 * para una plancha dentro de una sesión y para una plancha dentro de una batalla.
 */
import { memo } from 'react'
import { View, Pressable } from 'react-native'
import Animated, { ZoomIn } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { Play, Pause, RotateCcw } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { CountdownRing } from '@/components/training/CountdownRing'
import { AMBER, LIME, MUTED, SKY, TEAL, URGENT } from '@/components/training/constants'
import { formatCountdown } from '@calistenia/core/lib/countdown'
import type { TimerPhase } from '@calistenia/core/lib/exercise-timer'

const RING_SIZE = 184
const RING_STROKE = 8
const ADJUST_DELTAS = [-15, 15, 30] as const

export interface TimerPanelProps {
  phase: TimerPhase
  remainingSeconds: number
  precount: number
  progress: number
  endAt?: number | null
  now?: () => number
  canAdjust: boolean
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onRepeat: () => void
  onReset: () => void
  onAdjust: (deltaSeconds: number) => void
}

function ringColor(phase: TimerPhase, isUrgent: boolean): string {
  if (phase === 'done') return TEAL
  if (phase === 'countdown') return AMBER
  if (isUrgent) return URGENT
  if (phase === 'running' || phase === 'paused') return LIME
  return SKY
}

function TimerPanelComponent({
  phase,
  remainingSeconds,
  precount,
  progress,
  endAt = null,
  now,
  canAdjust,
  onStart,
  onPause,
  onResume,
  onRepeat,
  onReset,
  onAdjust,
}: TimerPanelProps) {
  const { t } = useTranslation()

  const isUrgent = phase === 'running' && remainingSeconds > 0 && remainingSeconds <= 10
  // Durante el "prepárate" y al terminar, el anillo se muestra lleno.
  const ringProgress = phase === 'countdown' || phase === 'done' ? 1 : progress
  const running = phase === 'running' && endAt !== null

  const primaryLabel =
    phase === 'done' ? t('timer.repeat') : phase === 'paused' ? t('timer.resume') : t('timer.start')
  const onPrimary = phase === 'idle' ? onStart : phase === 'paused' ? onResume : onRepeat

  return (
    <View className="items-center gap-4 py-2">
      <CountdownRing
        progress={ringProgress}
        endAt={running ? endAt : null}
        running={running}
        now={now}
        size={RING_SIZE}
        strokeWidth={RING_STROKE}
        color={ringColor(phase, isUrgent)}
        trackColor="hsl(0 0% 30%)"
        trackOpacity={0.35}
      >
        {phase === 'countdown' ? (
          <Animated.Text
            key={precount}
            entering={ZoomIn.duration(280)}
            className="font-bebas leading-none"
            style={{ fontSize: 76, color: AMBER }}
          >
            {precount}
          </Animated.Text>
        ) : phase === 'done' ? (
          <Text className="font-bebas leading-none" style={{ fontSize: 64, color: TEAL }}>✓</Text>
        ) : (
          <Text
            className="font-bebas leading-none tracking-[2px] tabular-nums"
            style={{ fontSize: 52, color: isUrgent ? URGENT : '#fafafa' }}
          >
            {formatCountdown(remainingSeconds)}
          </Text>
        )}
      </CountdownRing>

      {phase === 'countdown' ? (
        <Text className="font-mono text-[11px] tracking-[3px]" style={{ color: 'rgba(251,191,36,0.7)' }}>
          {t('timer.getReady').toUpperCase()}
        </Text>
      ) : phase === 'done' ? (
        <Text className="font-mono text-[11px] tracking-[3px]" style={{ color: TEAL }}>
          {t('timer.completed').toUpperCase()}
        </Text>
      ) : null}

      {canAdjust ? (
        <View className="flex-row gap-1.5">
          {ADJUST_DELTAS.map((delta) => (
            <Pressable
              key={delta}
              onPress={() => onAdjust(delta)}
              className="h-8 min-w-[48px] items-center justify-center rounded-md border border-border px-2.5 active:bg-muted"
              accessibilityRole="button"
              accessibilityLabel={t(delta > 0 ? 'timer.addSeconds' : 'timer.removeSeconds', {
                secs: Math.abs(delta),
              })}
            >
              <Text className="font-mono text-[11px] text-muted-foreground">
                {delta > 0 ? `+${delta}s` : `${delta}s`}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View className="flex-row items-center gap-3">
        {phase === 'running' ? (
          <Pressable
            onPress={onPause}
            className="h-11 min-w-[120px] flex-row items-center justify-center gap-2 rounded-full bg-destructive/10 px-6 active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel={t('timer.pause')}
          >
            <Pause size={18} color={URGENT} />
            <Text className="font-mono text-[12px] tracking-[2px]" style={{ color: URGENT }}>
              {t('timer.pause').toUpperCase()}
            </Text>
          </Pressable>
        ) : phase === 'countdown' ? null : (
          <Pressable
            onPress={onPrimary}
            className="h-11 min-w-[120px] flex-row items-center justify-center gap-2 rounded-full bg-lime/15 px-6 active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
          >
            <Play size={18} color={LIME} fill={LIME} />
            <Text className="font-mono text-[12px] tracking-[2px] text-lime">
              {primaryLabel.toUpperCase()}
            </Text>
          </Pressable>
        )}
        {phase === 'paused' || phase === 'done' ? (
          <Pressable
            onPress={onReset}
            className="size-11 items-center justify-center rounded-full bg-muted active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel={t('timer.reset')}
          >
            <RotateCcw size={18} color={MUTED} />
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

export const TimerPanel = memo(TimerPanelComponent)
