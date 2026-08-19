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
import React, { useCallback } from 'react'
import { useWindowDimensions } from 'react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { MOBILE_SHARE_CARD_CONTEXTS, shareCardImage, shareWorkoutSession } from '@/lib/share'
import type { Exercise, ExerciseTiming } from '@calistenia/core/types'
import { useShareCardCapture } from '@/hooks/useShareCardCapture'

import ShareCardCapture from '@/components/share/ShareCardCapture'
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
  const { width: screenW, height: screenH } = useWindowDimensions()

  const onCapture = useCallback(
    async (uri: string) => {
      const { message } = shareWorkoutSession({
        userName,
        workoutTitle,
        totalSets,
        durationMin,
        date,
        workoutKey,
        referralCode,
      })

      await shareCardImage(uri, { message, title: 'Compartir sesión' }, {
        ...MOBILE_SHARE_CARD_CONTEXTS.workoutHistory,
        workout_id: workoutKey,
      })
    },
    [userName, workoutTitle, totalSets, durationMin, date, workoutKey, referralCode],
  )

  const { captureRef, sharing, share } = useShareCardCapture({ onCapture })

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
        onPress={() => void share()}
      >
        <Text className="font-bebas text-lg tracking-[2px] text-foreground">
          {sharing ? 'GENERANDO…' : 'COMPARTIR'}
        </Text>
      </Button>
    </>
  )
}
