import { useState, useEffect, useRef } from 'react'
import { View, Pressable } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
  ZoomIn,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import Svg, { Circle } from 'react-native-svg'
import { Play, Pause, RotateCcw } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import * as sounds from '@/lib/sounds'
import { haptics as haptic } from '@/lib/haptics'
import { LIME, MUTED } from '@/components/session/constants'

// ─── Timed-exercise timer (web Timer.tsx parity) ──────────────────────────────
// Circular SVG ring + "PREPÁRATE" 3-2-1 pre-countdown + ±seconds + phase states.
const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const T_SIZE = 184
const T_STROKE = 8
const T_R = (T_SIZE - T_STROKE) / 2
const T_CIRC = 2 * Math.PI * T_R
const T_HALF = T_SIZE / 2

const RING = {
  idle: 'hsl(199 89% 62%)',
  countdown: 'hsl(45 93% 58%)',
  running: LIME,
  urgent: 'hsl(0 84% 60%)',
  done: 'hsl(160 84% 60%)',
}
const AMBER = 'hsl(45 93% 58%)'
const URGENT = 'hsl(0 84% 60%)'
const TEAL = 'hsl(160 84% 60%)'

type TimerPhase = 'idle' | 'countdown' | 'running' | 'paused' | 'done'

export function ExerciseTimer({ initialSeconds = 30 }: { initialSeconds?: number }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<TimerPhase>('idle')
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds)
  const [remaining, setRemaining] = useState(initialSeconds)
  const [countdownNum, setCountdownNum] = useState(3)
  const endAtRef = useRef<number>(0)
  const lastRemRef = useRef<number>(initialSeconds)
  const offset = useSharedValue(0)
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }))

  // Ring offset for non-running phases (running drives its own below).
  useEffect(() => {
    if (phase === 'running') return
    const target =
      phase === 'countdown' || phase === 'done'
        ? 0
        : T_CIRC * (1 - Math.max(0, Math.min(1, remaining / totalSeconds)))
    offset.value = withTiming(target, { duration: 300, easing: Easing.out(Easing.cubic) })
  }, [phase, remaining, totalSeconds, offset])

  // 3-2-1 "prepárate" pre-countdown.
  useEffect(() => {
    if (phase !== 'countdown') return
    setCountdownNum(3)
    sounds.playCountdownTick()
    haptic.selection()
    const id = setInterval(() => {
      setCountdownNum((n) => {
        if (n <= 1) {
          clearInterval(id)
          setPhase('running')
          return 0
        }
        sounds.playCountdownTick()
        haptic.selection()
        return n - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  // Running countdown (timestamp-based so it survives backgrounding).
  useEffect(() => {
    if (phase !== 'running') return
    endAtRef.current = Date.now() + remaining * 1000
    lastRemRef.current = remaining
    const id = setInterval(() => {
      const frac = Math.max(0, (endAtRef.current - Date.now()) / 1000)
      const rem = Math.ceil(frac)
      const prev = lastRemRef.current
      if (rem !== prev) {
        if (prev > 11 && rem <= 11 && rem > 0) { sounds.playWarning(); haptic.medium() }
        if (rem > 0 && rem <= 3 && prev === rem + 1) { sounds.playCountdownTick(); haptic.selection() }
        lastRemRef.current = rem
        setRemaining(rem)
      }
      offset.value = withTiming(T_CIRC * (1 - Math.min(1, frac / totalSeconds)), {
        duration: 250,
        easing: Easing.linear,
      })
      if (frac <= 0) {
        clearInterval(id)
        setRemaining(0)
        setPhase('done')
        sounds.playTimerComplete()
        haptic.success()
      }
    }, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const adjustTime = (delta: number) => {
    const newTotal = Math.max(5, totalSeconds + delta)
    setTotalSeconds(newTotal)
    setRemaining((r) => Math.max(1, Math.min(newTotal, r + delta)))
  }
  const start = () => setPhase('countdown')
  const pause = () => setPhase('paused')
  const resume = () => setPhase('running')
  const repeat = () => { setRemaining(totalSeconds); setPhase('countdown') }
  const reset = () => { setPhase('idle'); setRemaining(totalSeconds); lastRemRef.current = totalSeconds }

  const isUrgent = phase === 'running' && remaining > 0 && remaining <= 10
  const ringColor =
    phase === 'done' ? RING.done
    : phase === 'countdown' ? RING.countdown
    : isUrgent ? RING.urgent
    : phase === 'running' || phase === 'paused' ? RING.running
    : RING.idle
  const mins = Math.floor(remaining / 60)
  const secs = String(remaining % 60).padStart(2, '0')
  const canAdjust = phase === 'idle' || phase === 'paused'

  return (
    <View className="items-center gap-4 py-2">
      {/* Ring + center readout */}
      <View style={{ width: T_SIZE, height: T_SIZE }} className="items-center justify-center">
        <Svg width={T_SIZE} height={T_SIZE} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={T_HALF} cy={T_HALF} r={T_R} fill="none" stroke="hsl(0 0% 30%)" strokeWidth={T_STROKE} strokeOpacity={0.35} />
          <AnimatedCircle
            cx={T_HALF}
            cy={T_HALF}
            r={T_R}
            fill="none"
            stroke={ringColor}
            strokeWidth={T_STROKE}
            strokeDasharray={T_CIRC}
            strokeLinecap="round"
            animatedProps={animatedProps}
          />
        </Svg>
        {phase === 'countdown' ? (
          <Animated.Text key={countdownNum} entering={ZoomIn.duration(280)} className="font-bebas leading-none" style={{ fontSize: 76, color: AMBER }}>
            {countdownNum}
          </Animated.Text>
        ) : phase === 'done' ? (
          <Text className="font-bebas leading-none" style={{ fontSize: 64, color: TEAL }}>✓</Text>
        ) : (
          <Text
            className="font-bebas leading-none tracking-[2px] tabular-nums"
            style={{ fontSize: 52, color: isUrgent ? URGENT : '#fafafa' }}
          >
            {mins}:{secs}
          </Text>
        )}
      </View>

      {/* Status label */}
      {phase === 'countdown' ? (
        <Text className="font-mono text-[11px] tracking-[3px]" style={{ color: 'rgba(251,191,36,0.7)' }}>{t('timer.getReady').toUpperCase()}</Text>
      ) : phase === 'done' ? (
        <Text className="font-mono text-[11px] tracking-[3px]" style={{ color: TEAL }}>{t('timer.completed').toUpperCase()}</Text>
      ) : null}

      {/* ± seconds (idle/paused only) */}
      {canAdjust && (
        <View className="flex-row gap-1.5">
          {[-15, 15, 30].map((d) => (
            <Pressable
              key={d}
              onPress={() => adjustTime(d)}
              className="h-8 min-w-[48px] items-center justify-center rounded-md border border-border px-2.5 active:bg-muted"
              accessibilityLabel={t(d > 0 ? 'timer.addSeconds' : 'timer.removeSeconds', { secs: Math.abs(d) })}
            >
              <Text className="font-mono text-[11px] text-muted-foreground">{d > 0 ? `+${d}s` : `${d}s`}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Controls */}
      <View className="flex-row items-center gap-3">
        {phase === 'running' ? (
          <Pressable onPress={pause} className="h-11 min-w-[120px] flex-row items-center justify-center gap-2 rounded-full bg-destructive/10 px-6 active:opacity-80" accessibilityLabel={t('timer.pause')}>
            <Pause size={18} color={URGENT} />
            <Text className="font-mono text-[12px] tracking-[2px]" style={{ color: URGENT }}>{t('timer.pause').toUpperCase()}</Text>
          </Pressable>
        ) : phase === 'countdown' ? null : (
          <Pressable
            onPress={phase === 'idle' ? start : phase === 'paused' ? resume : repeat}
            className="h-11 min-w-[120px] flex-row items-center justify-center gap-2 rounded-full bg-lime/15 px-6 active:opacity-80"
            accessibilityLabel={phase === 'done' ? t('timer.repeat') : phase === 'paused' ? t('timer.resume') : t('timer.start')}
          >
            <Play size={18} color={LIME} fill={LIME} />
            <Text className="font-mono text-[12px] tracking-[2px] text-lime">
              {(phase === 'done' ? t('timer.repeat') : phase === 'paused' ? t('timer.resume') : t('timer.start')).toUpperCase()}
            </Text>
          </Pressable>
        )}
        {(phase === 'paused' || phase === 'done') && (
          <Pressable onPress={reset} className="size-11 items-center justify-center rounded-full bg-muted active:opacity-80" accessibilityLabel={t('timer.reset')}>
            <RotateCcw size={18} color={MUTED} />
          </Pressable>
        )}
      </View>
    </View>
  )
}
