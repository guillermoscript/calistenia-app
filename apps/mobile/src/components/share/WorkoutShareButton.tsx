/**
 * WorkoutShareButton — renders WorkoutShareCard off-screen via ShareCardCapture,
 * captures a full-bleed story PNG sized to the device screen, then shares it.
 *
 * Usage:
 *   <WorkoutShareButton
 *     workoutTitle={resolvedTitle}
 *     totalSets={totalSets}
 *     durationMin={durationMin}
 *     date={date}
 *     workoutKey={workoutKey}
 *     exercises={shareExercises}
 *     timings={shareTimings}
 *     userName={userName}
 *     avatarUrl={avatarUrl}
 *     referralCode={referralCode}
 *   />
 */
import React, { useRef, useCallback, useState } from 'react'
import { useWindowDimensions } from 'react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { shareImage, shareWorkoutSession } from '@/lib/share'
import { op } from '@calistenia/core/lib/analytics'
import type { Exercise, ExerciseTiming } from '@calistenia/core/types'

import ShareCardCapture, {
  type ShareCardCaptureHandle,
} from '@/components/share/ShareCardCapture'
import WorkoutShareCard from '@/components/share/WorkoutShareCard'

export interface WorkoutShareButtonProps {
  workoutTitle: string
  totalSets: number
  durationMin: number
  date: string
  workoutKey: string
  exercises: Exercise[]
  timings: ExerciseTiming[]
  userName: string
  avatarUrl: string | null
  referralCode: string | null
}

export default function WorkoutShareButton({
  workoutTitle,
  totalSets,
  durationMin,
  date,
  workoutKey,
  exercises,
  timings,
  userName,
  avatarUrl,
  referralCode,
}: WorkoutShareButtonProps) {
  const captureRef = useRef<ShareCardCaptureHandle>(null)
  const [sharing, setSharing] = useState(false)
  const { width: screenW, height: screenH } = useWindowDimensions()

  const handleShare = useCallback(async () => {
    if (sharing) return
    setSharing(true)
    try {
      // Fonts are already loaded by _layout boot; RAF guards against a blank capture.
      await new Promise((r) => requestAnimationFrame(() => r(null)))

      const uri = await captureRef.current?.capture()
      if (!uri) return

      const { message } = shareWorkoutSession({
        userName,
        workoutTitle,
        totalSets,
        durationMin,
        date,
        workoutKey,
        referralCode,
      })

      await shareImage(uri, { message, title: 'Compartir sesión' })

      op.track('share_card_shared', { card_type: 'workout' })
    } catch {
      // User cancelled the share sheet or capture failed — no-op.
    } finally {
      setSharing(false)
    }
  }, [sharing, userName, workoutTitle, totalSets, durationMin, date, workoutKey, referralCode])

  return (
    <>
      {/* Off-screen capture container — renders behind the real UI */}
      <ShareCardCapture ref={captureRef} width={screenW} height={screenH}>
        <WorkoutShareCard
          workoutTitle={workoutTitle}
          totalSets={totalSets}
          durationMin={durationMin}
          date={date}
          exercises={exercises}
          timings={timings}
          userName={userName}
          avatarUrl={avatarUrl}
          referralCode={referralCode}
          width={screenW}
          height={screenH}
        />
      </ShareCardCapture>

      {/* Visible button */}
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        disabled={sharing}
        onPress={() => void handleShare()}
      >
        <Text className="font-bebas text-lg tracking-[2px] text-foreground">
          {sharing ? 'GENERANDO…' : 'COMPARTIR'}
        </Text>
      </Button>
    </>
  )
}
