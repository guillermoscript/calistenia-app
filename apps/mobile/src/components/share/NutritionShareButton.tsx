/**
 * NutritionShareButton — captures NutritionShareCard off-screen via
 * ShareCardCapture, then shares the PNG via the native sheet.
 *
 * On press, opens a native Modal preview with a Simple/Rich toggle so the
 * user can choose the card variant before sharing.
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
 *     entries={entries}
 *   />
 */
import React, { useRef, useCallback, useState, useMemo } from 'react'
import {
  View,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
  StyleSheet,
  ActivityIndicator,
  InteractionManager,
  Platform,
} from 'react-native'
import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { shareImage, shareNutritionDay } from '@/lib/share'
import { op } from '@calistenia/core/lib/analytics'
import type { NutritionEntry, QualityScore } from '@calistenia/core/types'
import { buildShareMeals } from '@calistenia/core/lib/share-meals'
import { computeDailyQualityScore } from '@calistenia/core/lib/nutrition-quality'

import ShareCardCapture, {
  type ShareCardCaptureHandle,
} from '@/components/share/ShareCardCapture'
import NutritionShareCard from '@/components/share/NutritionShareCard'

// ── Card dimensions ────────────────────────────────────────────────────────────
const CARD_W = 360
const CARD_H = 640

// ── Palette (mirror card constants for modal chrome) ─────────────────────────
const CARD_BG   = '#0a0a0b'
const SURFACE   = '#141416'
const HAIRLINE  = 'rgba(245,245,244,0.14)'
const INK       = '#f5f5f4'
const INK_DIM   = 'rgba(245,245,244,0.66)'
const INK_FAINT = 'rgba(245,245,244,0.38)'
const LIME      = '#a3e635'

// Prefetch timeout in ms — a single slow tile won't hang the share.
const PREFETCH_TIMEOUT = 3000

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
  /** Full day entries — used to derive meals + dailyQualityScore for rich card. */
  entries?: NutritionEntry[]
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
  entries = [],
}: NutritionShareButtonProps) {
  const { t } = useTranslation()
  const { width: screenW, height: screenH } = useWindowDimensions()

  // Off-screen capture refs — one per variant so we can always capture the
  // selected variant without switching render trees at share time.
  const summaryRef = useRef<ShareCardCaptureHandle>(null)
  const richRef    = useRef<ShareCardCaptureHandle>(null)

  const [modalVisible, setModalVisible] = useState(false)
  const [variant, setVariant] = useState<'summary' | 'rich'>('summary')
  const [sharing, setSharing] = useState(false)

  // ── Derived data (memoized — stable across re-renders) ────────────────────
  const { meals, overflow: mealsOverflow } = useMemo(
    () => buildShareMeals(entries, 4),
    [entries],
  )

  const derivedQualityScore = useMemo(
    () => computeDailyQualityScore(entries),
    [entries],
  )

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openModal = useCallback(() => {
    setModalVisible(true)
  }, [])

  const closeModal = useCallback(() => {
    if (sharing) return
    setModalVisible(false)
  }, [sharing])

  const handleShare = useCallback(async () => {
    if (sharing) return
    setSharing(true)
    try {
      // 1. Prefetch meal photos (rich only) with timeout so a bad URL can't hang.
      if (variant === 'rich') {
        const photoUrls = meals.map((m) => m.photoUrl).filter((u): u is string => Boolean(u))
        if (photoUrls.length > 0) {
          await Promise.race([
            Promise.all(photoUrls.map((url) => Image.prefetch(url).catch(() => {}))),
            new Promise<void>((resolve) => setTimeout(resolve, PREFETCH_TIMEOUT)),
          ])
        }
      }

      // 2. Wait for interactions + two animation frames so expo-image thumbnails
      //    (and fonts) are definitely painted in the off-screen capture container.
      await new Promise<void>((resolve) =>
        InteractionManager.runAfterInteractions(() => resolve()),
      )
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

      // 3. Capture the selected variant.
      const captureRef = variant === 'rich' ? richRef : summaryRef
      const uri = await captureRef.current?.capture()
      if (!uri) return

      // 4. Build share message.
      const { message, url } = shareNutritionDay({
        userName,
        date,
        calories: Math.round(totals.calories),
        goalCalories: goals?.dailyCalories,
        qualityScore: derivedQualityScore ?? qualityScore,
        referralCode,
      })

      // 5. Share.
      await shareImage(uri, { message: `${message}\n${url}`, title: 'Compartir nutrición' })

      op.track('share_card_shared', { card_type: 'nutrition', variant })

      setModalVisible(false)
    } catch {
      // User cancelled share sheet or capture failed — no-op.
    } finally {
      setSharing(false)
    }
  }, [sharing, variant, meals, date, totals, goals, qualityScore, derivedQualityScore, userName, referralCode])

  // ── Preview scale — fit CARD_W×CARD_H inside the modal preview area ──────
  // Modal inner width ≈ screenW - 48px padding
  const previewAreaW = screenW - 48
  const computedPreviewH = CARD_H * (previewAreaW / CARD_W)
  // Cap preview height to 50% of screen so toggle + COMPARTIR are always visible
  const previewH = Math.min(computedPreviewH, screenH * 0.5)
  // Recompute scale from the capped height (keeps card aspect ratio)
  const scale = previewH / CARD_H

  const sharedCardProps = {
    date,
    totals,
    goals,
    waterMl,
    waterGoal,
    qualityScore,
    mealCount,
    userName,
    avatarUrl,
    meals,
    mealsOverflow,
    dailyQualityScore: derivedQualityScore,
    width: CARD_W,
    height: CARD_H,
  }

  return (
    <>
      {/* ── Off-screen capture containers (always rendered, hidden at -9999) ── */}
      <ShareCardCapture ref={summaryRef} width={CARD_W} height={CARD_H}>
        <NutritionShareCard {...sharedCardProps} variant="summary" />
      </ShareCardCapture>

      <ShareCardCapture ref={richRef} width={CARD_W} height={CARD_H}>
        <NutritionShareCard {...sharedCardProps} variant="rich" />
      </ShareCardCapture>

      {/* ── Visible trigger button ── */}
      <Button
        variant="outline"
        size="sm"
        className="border-lime-400/30 bg-lime-400/5"
        onPress={openModal}
      >
        <Text className="font-mono text-[10px] tracking-widest text-lime-400 uppercase">
          COMPARTIR
        </Text>
      </Button>

      {/* ── Preview modal (native slide — NOT gorhom, per CLAUDE.md MIUI guidance) ── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
        statusBarTranslucent={Platform.OS === 'android'}
      >
        {/* Semi-transparent backdrop — tap to dismiss */}
        <Pressable style={styles.backdrop} onPress={closeModal}>
          {/* Bottom sheet container — prevent tap-through */}
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>

            {/* ── Sheet header ── */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>COMPARTIR</Text>
              <Pressable
                onPress={closeModal}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={styles.closeBtn}>✕</Text>
              </Pressable>
            </View>

            {/* ── Variant toggle ── */}
            <View style={styles.toggleRow}>
              {(['summary', 'rich'] as const).map((v) => {
                const label = v === 'summary'
                  ? t('nutrition.summary.variantSummary')
                  : t('nutrition.summary.variantMeals')
                const active = variant === v
                return (
                  <Pressable
                    key={v}
                    onPress={() => setVariant(v)}
                    style={[styles.toggleBtn, active && styles.toggleBtnActive]}
                  >
                    <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>
                      {label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            {/* ── Scaled live preview (scrollable so it never pushes COMPARTIR off-screen) ── */}
            <ScrollView
              style={{ maxHeight: previewH }}
              contentContainerStyle={{ alignItems: 'center' }}
              scrollEnabled={false}
              pointerEvents="none"
            >
              <View
                style={[
                  styles.previewContainer,
                  { height: previewH, width: previewAreaW },
                ]}
              >
                <View style={{
                  width: CARD_W,
                  height: CARD_H,
                  transform: [{ scale }],
                  transformOrigin: 'top left',
                }}>
                  <NutritionShareCard
                    {...sharedCardProps}
                    variant={variant}
                  />
                </View>
              </View>
            </ScrollView>

            {/* ── Share button ── */}
            <Pressable
              onPress={() => void handleShare()}
              disabled={sharing}
              style={({ pressed }) => [
                styles.shareBtn,
                { opacity: sharing || pressed ? 0.7 : 1 },
              ]}
            >
              {sharing ? (
                <ActivityIndicator size="small" color={CARD_BG} />
              ) : (
                <Text style={styles.shareBtnText}>COMPARTIR</Text>
              )}
            </Pressable>

          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: SURFACE,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: '92%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontFamily: 'JetBrainsMono_700Bold',
    color: INK,
    fontSize: 11,
    letterSpacing: 3,
  },
  closeBtn: {
    fontFamily: 'DMSans_400Regular',
    color: INK_DIM,
    fontSize: 16,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 14,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  toggleBtnActive: {
    backgroundColor: LIME + '18',
    borderWidth: 0,
  },
  toggleLabel: {
    fontFamily: 'JetBrainsMono_400Regular',
    color: INK_FAINT,
    fontSize: 10,
    letterSpacing: 2,
  },
  toggleLabelActive: {
    color: LIME,
  },

  // Preview
  previewContainer: {
    overflow: 'hidden',
    borderRadius: 8,
    marginBottom: 16,
    alignSelf: 'center',
  },

  // Share button
  shareBtn: {
    backgroundColor: LIME,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shareBtnText: {
    fontFamily: 'JetBrainsMono_700Bold',
    color: CARD_BG,
    fontSize: 11,
    letterSpacing: 3,
  },
})
