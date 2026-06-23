/**
 * NutritionShareButton — captures NutritionShareCard off-screen via
 * ShareCardCapture, then shares the PNG via the native sheet.
 *
 * Usage:
 *   <NutritionShareButton
 *     date={selectedDate}
 *     totals={dailyTotals}
 *     goals={goals}
 *     waterMl={waterTotal}
 *     waterGoal={waterGoal}
 *     qualityScore={dailyQualityScore}
 *     mealCount={entries.length}
 *     userName={userName}
 *     avatarUrl={avatarUrl}
 *     referralCode={referralCode}
 *   />
 */
import React, { useRef, useCallback, useState } from 'react'
import { useWindowDimensions } from 'react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { shareImage, shareNutritionDay } from '@/lib/share'
import { op } from '@calistenia/core/lib/analytics'
import type { QualityScore } from '@calistenia/core/types'

import ShareCardCapture, {
  type ShareCardCaptureHandle,
} from '@/components/share/ShareCardCapture'
import NutritionShareCard from '@/components/share/NutritionShareCard'

interface NutritionShareButtonProps {
  date: string
  totals: { calories: number; protein: number; carbs: number; fat: number }
  goals: {
    dailyCalories: number
    dailyProtein: number
    dailyCarbs: number
    dailyFat: number
  } | null
  waterMl?: number
  waterGoal?: number
  qualityScore?: QualityScore
  mealCount?: number
  userName?: string
  avatarUrl?: string | null
  referralCode?: string | null
}

export default function NutritionShareButton({
  date,
  totals,
  goals,
  waterMl,
  waterGoal,
  qualityScore,
  mealCount,
  userName,
  avatarUrl,
  referralCode,
}: NutritionShareButtonProps) {
  const captureRef = useRef<ShareCardCaptureHandle>(null)
  const { width: screenW, height: screenH } = useWindowDimensions()
  const [sharing, setSharing] = useState(false)

  const handleShare = useCallback(async () => {
    if (sharing) return
    setSharing(true)
    try {
      // Small RAF guard so fonts are definitely painted before snapshot.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

      const uri = await captureRef.current?.capture()
      if (!uri) return

      const { message, url } = shareNutritionDay({
        userName,
        date,
        calories: Math.round(totals.calories),
        goalCalories: goals?.dailyCalories,
        qualityScore,
        referralCode,
      })

      await shareImage(uri, { message: `${message}\n${url}`, title: 'Compartir nutrición' })

      op.track('share_card_shared', { card_type: 'nutrition' })
    } catch {
      // User cancelled the share sheet or capture failed — no-op.
    } finally {
      setSharing(false)
    }
  }, [sharing, date, totals, goals, qualityScore, userName, referralCode])

  return (
    <>
      {/* Off-screen capture container — rendered behind real UI, never visible */}
      <ShareCardCapture ref={captureRef} width={screenW} height={screenH}>
        <NutritionShareCard
          date={date}
          totals={totals}
          goals={goals}
          waterMl={waterMl}
          waterGoal={waterGoal}
          qualityScore={qualityScore}
          mealCount={mealCount}
          userName={userName}
          avatarUrl={avatarUrl}
          width={screenW}
          height={screenH}
        />
      </ShareCardCapture>

      {/* Visible button */}
      <Button
        variant="outline"
        size="sm"
        className="border-lime-400/30 bg-lime-400/5"
        disabled={sharing}
        onPress={() => void handleShare()}
      >
        <Text className="font-mono text-[10px] tracking-widest text-lime-400 uppercase">
          {sharing ? 'GENERANDO…' : 'COMPARTIR'}
        </Text>
      </Button>
    </>
  )
}
