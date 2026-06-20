import { useState, useEffect, useRef } from 'react'
import { View, AppState } from 'react-native'
import { useTranslation } from 'react-i18next'
import Svg, { Circle } from 'react-native-svg'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { scheduleRestEnd, cancelScheduled } from '@/lib/notifications'
import { updateLiveRest, liveSessionHandlesRest } from '@/lib/live-session'
import * as sounds from '@/lib/sounds'
import { haptics as haptic } from '@/lib/haptics'
import { LIME, MUTED } from '@/components/session/constants'
import type { Step } from '@/components/session/types'

// ─── Rest screen ──────────────────────────────────────────────────────────────

interface RestScreenProps {
  seconds: number
  exerciseId?: string
  nextStep: Step | null
  onSkip: () => void
  savedRest?: number
  onAdjust?: (exerciseId: string, seconds: number) => void
}

export function RestScreen({ seconds: defaultSeconds, exerciseId, nextStep, onSkip, savedRest, onAdjust }: RestScreenProps) {
  const { t } = useTranslation()
  const initialSeconds = savedRest || defaultSeconds
  const endAtRef = useRef<number>(Date.now() + initialSeconds * 1000)
  const [remaining, setRemaining] = useState<number>(initialSeconds)
  const [totalSecs, setTotalSecs] = useState<number>(initialSeconds)
  const hasPlayedWarning = useRef<boolean>(false)
  const hasFinished = useRef<boolean>(false)
  const lastRemainingRef = useRef<number>(initialSeconds)
  const notifIdRef = useRef<string | null>(null)
  const onSkipRef = useRef(onSkip)
  onSkipRef.current = onSkip
  const nextStepRef = useRef(nextStep)
  nextStepRef.current = nextStep

  useEffect(() => { sounds.playRestStart() }, [])

  // Notificación local programada para el fin del descanso (se ve si la app
  // está en background; en foreground el handler la silencia).
  useEffect(() => {
    const ns = nextStepRef.current
    // En Android nativo el cronómetro de la notificación persistente ya avisa
    // del fin del descanso — la puntual sería redundante
    if (!liveSessionHandlesRest()) {
      scheduleRestEnd(
        Math.ceil((endAtRef.current - Date.now()) / 1000),
        t('notify.letsGo'),
        ns ? `${ns.exercise.name} — ${t('notify.setOf', { set: ns.setNumber, total: ns.totalSets })}` : t('notify.prepareForNext'),
      ).then(id => { notifIdRef.current = id })
    }
    updateLiveRest(endAtRef.current)
    return () => { cancelScheduled(notifIdRef.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown por timestamp — sobrevive backgrounding (se re-sincroniza al volver)
  useEffect(() => {
    const tick = () => {
      const rem = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000))
      const prev = lastRemainingRef.current
      if (rem !== prev) {
        if (prev > 10 && rem <= 10 && rem > 0 && !hasPlayedWarning.current) {
          hasPlayedWarning.current = true
          sounds.playWarning()
          haptic.warning()
        }
        if (rem > 0 && rem <= 3 && prev === rem + 1) {
          sounds.playCountdownTick()
          haptic.light()
        }
        lastRemainingRef.current = rem
        setRemaining(rem)
      }
      if (rem <= 0 && !hasFinished.current) {
        hasFinished.current = true
        sounds.playGetReady()
        haptic.success()
        onSkipRef.current()
      }
    }

    const id = setInterval(tick, 250)
    const sub = AppState.addEventListener('change', state => { if (state === 'active') tick() })
    return () => {
      clearInterval(id)
      sub.remove()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const adjustTime = (delta: number) => {
    const newTotal = Math.max(10, totalSecs + delta)
    setTotalSecs(newTotal)
    endAtRef.current += delta * 1000
    const rem = Math.max(1, Math.ceil((endAtRef.current - Date.now()) / 1000))
    lastRemainingRef.current = rem
    setRemaining(rem)
    // Reprogramar la notificación con el nuevo fin
    cancelScheduled(notifIdRef.current)
    const ns = nextStepRef.current
    if (!liveSessionHandlesRest()) {
      scheduleRestEnd(
        rem,
        t('notify.letsGo'),
        ns ? `${ns.exercise.name} — ${t('notify.setOf', { set: ns.setNumber, total: ns.totalSets })}` : t('notify.prepareForNext'),
      ).then(id => { notifIdRef.current = id })
    }
    updateLiveRest(endAtRef.current)
    if (exerciseId && onAdjust) onAdjust(exerciseId, newTotal)
  }

  const handleSkip = () => {
    cancelScheduled(notifIdRef.current)
    onSkip()
  }

  const mins = Math.floor(remaining / 60)
  const secs = String(remaining % 60).padStart(2, '0')
  const pct = totalSecs > 0 ? remaining / totalSecs : 0
  const ringR = 62
  const ringSize = 148
  const ringStroke = 7
  const circumference = 2 * Math.PI * ringR
  const strokeOffset = circumference * (1 - pct)
  const isUrgent = remaining > 0 && remaining < 10

  return (
    <View className="flex-1 items-center justify-center gap-7 px-6">
      <Text className="font-mono text-[11px] uppercase tracking-[4px] text-muted-foreground">{t('session.resting')}</Text>

      <View style={{ width: ringSize, height: ringSize }}>
        <Svg width={ringSize} height={ringSize} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={ringSize / 2} cy={ringSize / 2} r={ringR} fill="none"
            stroke={MUTED} strokeOpacity={0.25} strokeWidth={ringStroke} />
          <Circle
            cx={ringSize / 2} cy={ringSize / 2} r={ringR} fill="none"
            stroke={isUrgent ? 'hsl(0 84% 60%)' : LIME}
            strokeWidth={ringStroke}
            strokeDasharray={`${circumference}`}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
          />
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className={cn('font-bebas text-[46px] tracking-[2px] tabular-nums leading-none', isUrgent ? 'text-destructive' : 'text-foreground')}>
            {mins}:{secs}
          </Text>
        </View>
      </View>

      {nextStep && (
        <View className="w-full max-w-[340px] rounded-xl border border-border bg-card px-4 py-3.5">
          <Text className="mb-2 font-mono text-[9px] uppercase tracking-[3px] text-muted-foreground">{t('notify.prepareForNext')}</Text>
          <Text className="mb-1 font-sans-medium text-[15px] text-foreground">{nextStep.exercise.name}</Text>
          <Text className="font-mono text-xs text-lime">
            {nextStep.exercise.reps}
            <Text className="font-mono text-[11px] text-muted-foreground">  · {t('session.set')} {nextStep.setNumber}/{nextStep.totalSets}</Text>
          </Text>
          <Text className="mt-1 font-mono text-[10px] tracking-wide text-muted-foreground">{nextStep.exercise.muscles}</Text>
        </View>
      )}

      <View className="flex-row gap-2">
        <Button variant="outline" size="sm" onPress={() => adjustTime(-15)}><Text className="font-mono text-[11px] text-muted-foreground">-15s</Text></Button>
        <Button variant="outline" size="sm" onPress={() => adjustTime(15)}><Text className="font-mono text-[11px] text-muted-foreground">+15s</Text></Button>
        <Button variant="outline" size="sm" onPress={() => adjustTime(30)}><Text className="font-mono text-[11px] text-muted-foreground">+30s</Text></Button>
      </View>

      <Button variant="outline" className="border-lime/25 bg-lime/10 px-8" onPress={handleSkip}>
        <Text className="font-mono text-[11px] tracking-[2px] text-lime">{t('session.skipRest')}</Text>
      </Button>
    </View>
  )
}
