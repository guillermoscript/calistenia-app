import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, ScrollView, Pressable, useWindowDimensions } from 'react-native'
import Animated, { FadeIn, FadeInDown, ZoomIn, useReducedMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import * as sounds from '@/lib/sounds'
import { haptics as haptic } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import { MOBILE_SHARE_CARD_CONTEXTS, shareCardImage, shareWorkoutSession } from '@/lib/share'
import Confetti from '@/components/Confetti'
import WorkoutShareCard from '@/components/share/WorkoutShareCard'
import ShareCardCapture, { type ShareCardCaptureHandle } from '@/components/share/ShareCardCapture'
import { PostWorkoutActions } from '@/components/session/PostWorkoutActions'
import TimingBar from '@/components/session/TimingBar'
import { getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import { getCelebrationTagline } from '@calistenia/core/lib/celebration'
import { getLocalQuote, type Quote } from '@calistenia/core/lib/quotes'
import { prepareTimingBreakdown } from '@calistenia/core/lib/exerciseTiming'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import type { Exercise, ExerciseTiming } from '@calistenia/core/types'

interface CelebrateScreenProps {
  workoutTitle: string
  totalSetsLogged: number
  durationMin: number
  exercises: Exercise[]
  workoutKey: string
  timings: ExerciseTiming[]
  totalSessions: number
  onDone: () => void
  onRepeat?: () => void
  onNavigateAway: (path: string) => void
}

/** Pantalla final: resultado, cita, desglose de tiempos y panel post-entreno. */
export default function CelebrateScreen({
  workoutTitle,
  totalSetsLogged,
  durationMin,
  exercises,
  workoutKey,
  timings,
  totalSessions,
  onDone,
  onRepeat,
  onNavigateAway,
}: CelebrateScreenProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const { width: screenW, height: screenH } = useWindowDimensions()
  const user = useAuthUser()
  const timingBreakdown = useMemo(() => prepareTimingBreakdown(timings, 6), [timings])
  // Init perezosa: `useRef(expr).current` evaluaba la cita, el tagline y la
  // fecha en cada render solo para tirarlos (#475).
  const [quote] = useState<Quote>(getLocalQuote)
  const [tagline] = useState<string>(() => getCelebrationTagline({
    durationMin,
    totalSets: totalSetsLogged,
    exerciseCount: exercises.length,
    hour: new Date().getHours(),
  }))
  const [today] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const captureRef = useRef<ShareCardCaptureHandle>(null)
  const [sharing, setSharing] = useState(false)
  const exerciseIds = useMemo(() => exercises.map(e => e.id), [exercises])

  useEffect(() => {
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.postWorkoutActionViewed, {
      surface: 'post_workout',
      source: 'workout_completion',
      workout_id: workoutKey,
      result: 'viewed',
    })
  }, [workoutKey])

  const userName = (user?.display_name as string) || (user?.name as string) || 'Atleta'
  const avatarUrl = user ? getUserAvatarUrl(user, '200x200') : null
  const referralCode = (user?.referral_code as string) || null

  useEffect(() => {
    sounds.playSessionComplete()
    haptic.success()
  }, [])

  const handleShare = useCallback(async () => {
    if (sharing) return
    setSharing(true)
    try {
      // Fonts are loaded by _layout boot; small RAF guards against a blank capture.
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      const uri = await captureRef.current?.capture()
      if (uri) {
        const { message } = shareWorkoutSession({
          userName,
          workoutTitle,
          totalSets: totalSetsLogged,
          durationMin,
          date: today,
          workoutKey,
          referralCode,
        })
        await shareCardImage(uri, { message, title: 'Compartir sesión' }, {
          ...MOBILE_SHARE_CARD_CONTEXTS.workoutCompletion,
          workout_id: workoutKey,
        })
      }
    } catch {
      // User cancelled the share sheet or capture failed — no-op.
    } finally {
      setSharing(false)
    }
  }, [sharing, userName, workoutTitle, totalSetsLogged, durationMin, today, workoutKey, referralCode])

  return (
    <View className="flex-1">
      <Confetti />
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow px-6 py-10"
        showsVerticalScrollIndicator={false}
      >
    <Pressable onPress={onDone} className="grow items-center justify-center gap-7">
      <Animated.View
        entering={reduced ? undefined : ZoomIn.duration(450).springify().damping(11)}
        className="size-[88px] items-center justify-center rounded-full border border-border bg-muted"
      >
        <Text className="text-[40px] text-lime">✓</Text>
      </Animated.View>

      <Animated.View entering={reduced ? undefined : FadeInDown.delay(120).duration(450)} className="items-center">
        <Text className="text-center font-bebas text-5xl leading-none tracking-[3px] text-foreground">
          {t('notify.sessionComplete')}
        </Text>
        <Text className="mt-2.5 font-mono text-[11px] tracking-[2px] text-muted-foreground">
          {workoutTitle.toUpperCase()} · {totalSetsLogged} SERIES · {durationMin} MIN
        </Text>
        <Text className="mt-2 text-center font-sans-medium text-[13px] text-lime">{tagline}</Text>
      </Animated.View>

      {timingBreakdown.rows.length > 0 && (
        <Animated.View entering={reduced ? undefined : FadeInDown.delay(240).duration(450)} className="w-full max-w-[360px] gap-1.5">
          <Text className="mb-1 font-mono text-[9px] uppercase tracking-[3px] text-muted-foreground">Tiempo por ejercicio</Text>
          {timingBreakdown.rows.map((row, i) => (
            <TimingBar
              key={row.exerciseId}
              name={row.exerciseName}
              pct={Math.max(row.pct, 8)}
              seconds={row.seconds}
              isMax={row.isMax}
              delay={350 + i * 80}
              animate={!reduced}
            />
          ))}
          {timingBreakdown.overflowCount > 0 && (
            <Text className="font-mono text-[10px] text-muted-foreground/50">+{timingBreakdown.overflowCount} más</Text>
          )}
        </Animated.View>
      )}

      {quote && (
        <Animated.View entering={reduced ? undefined : FadeInDown.delay(420).duration(450)} className="max-w-[380px] items-center">
          <Text className="mb-2.5 text-center font-sans-italic text-base leading-6 text-foreground/70">&quot;{quote.q}&quot;</Text>
          <Text className="font-mono text-[11px] tracking-wide text-muted-foreground">— {quote.a}</Text>
        </Animated.View>
      )}

      {/* Off-screen share card (captured to PNG on demand). Sized to the device
          screen for a full-bleed story image. */}
      <ShareCardCapture ref={captureRef} width={screenW} height={screenH}>
        <WorkoutShareCard
          workoutTitle={workoutTitle}
          totalSets={totalSetsLogged}
          durationMin={durationMin}
          date={today}
          exercises={exercises}
          timings={timings}
          quote={quote ? { q: quote.q, a: quote.a } : null}
          userName={userName}
          avatarUrl={avatarUrl}
          referralCode={referralCode}
          width={screenW}
          height={screenH}
        />
      </ShareCardCapture>
    </Pressable>

    {/* Fuera del Pressable de arriba: sus pulsaciones no deben cerrar la
        celebración. */}
    <PostWorkoutActions
      workoutKey={workoutKey}
      userId={user?.id}
      exerciseIds={exerciseIds}
      referralCode={referralCode}
      userName={userName}
      totalSessions={totalSessions}
      sharing={sharing}
      onShare={handleShare}
      onRepeat={onRepeat}
      onNavigateAway={onNavigateAway}
    />

    <Pressable onPress={onDone} className="items-center gap-2.5 pt-7">
      <Animated.View entering={reduced ? undefined : FadeInDown.delay(720).duration(450)} className="w-full max-w-[280px]">
        <Button size="lg" className="w-full bg-lime active:bg-lime/90" onPress={() => { haptic.medium(); onDone() }}>
          <Text className="font-bebas text-xl tracking-[2px] text-lime-foreground">{t('nav.dashboard').toUpperCase()}</Text>
        </Button>
      </Animated.View>

      <Animated.Text
        entering={reduced ? undefined : FadeIn.delay(800).duration(400)}
        className="font-mono text-[11px] tracking-wide text-muted-foreground/50"
      >
        o toca en cualquier lugar
      </Animated.Text>
    </Pressable>
      </ScrollView>
    </View>
  )
}
