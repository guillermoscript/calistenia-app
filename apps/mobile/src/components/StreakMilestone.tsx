/**
 * StreakMilestone — modal centrado para los hitos de racha SEMANAL (#858):
 * 4, 8, 12, 26 y 52 semanas seguidas cumpliendo el objetivo.
 *
 * Al montar mira en AsyncStorage qué hitos ya se enseñaron. Si no toca
 * ninguno, no pinta nada. No sale si ya hay otro modal automático a la vista
 * (`overlay-gate`): en ese caso no se marca y se intenta en la próxima visita.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { haptics } from '@/lib/haptics'
import { MOBILE_SHARE_CARD_CONTEXTS, shareText, shareCardImage, shareReferralInvite } from '@/lib/share'
import ShareCardCapture, { type ShareCardCaptureHandle } from '@/components/share/ShareCardCapture'
import StreakShareCard from '@/components/share/StreakShareCard'
import {
  getActiveWeeklyMilestone,
  getShownWeeklyMilestones,
  markWeeklyMilestoneShown,
} from '@/lib/streak-milestones'
import { isAnyOverlayOpen, setOverlayOpen } from '@/lib/overlay-gate'
import { WEB_BASE_URL } from '@calistenia/core/lib/app-urls'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import { todayStr } from '@calistenia/core/lib/dateUtils'

export interface StreakMilestoneProps {
  /** Semanas seguidas cumpliendo el objetivo (`computeWeeklyStreak().current`). */
  weeks: number
  userId: string
  userName: string
  referralCode?: string | null
}

type Phase = 'loading' | 'visible' | 'hidden'

const OVERLAY_ID = 'streak_milestone'

export default function StreakMilestone({
  weeks,
  userId,
  userName,
  referralCode,
}: StreakMilestoneProps) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('loading')
  const [milestone, setMilestone] = useState<number | null>(null)
  const scale = useRef(new Animated.Value(0.85)).current
  const opacity = useRef(new Animated.Value(0)).current
  const captureRef = useRef<ShareCardCaptureHandle>(null)
  const { width: screenW, height: screenH } = useWindowDimensions()
  const today = useRef<string>(todayStr()).current

  useEffect(() => {
    let cancelled = false
    async function check() {
      const shown = await getShownWeeklyMilestones(userId)
      const active = getActiveWeeklyMilestone(weeks, shown)
      if (cancelled) return
      if (active === null || isAnyOverlayOpen()) {
        setPhase('hidden')
        return
      }
      setMilestone(active)
      await markWeeklyMilestoneShown(userId, active)
      setOverlayOpen(OVERLAY_ID, true)
      setPhase('visible')
      haptics.success()
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 14,
          stiffness: 180,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start()
    }
    void check()
    return () => { cancelled = true }
  }, [userId, weeks, scale, opacity])

  // Si el inicio desmonta el modal (p. ej. empieza una actividad), libera el turno.
  useEffect(() => () => setOverlayOpen(OVERLAY_ID, false), [])

  const handleDismiss = useCallback(() => {
    // En el cierre y no al mostrarlo, igual que web (#636 §5): así el evento
    // mide que el usuario VIO el hito, no que el componente se montó.
    if (milestone) {
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.streakMilestone, {
        surface: 'streak', source: 'streak_card', weeks: milestone, unit: 'weeks',
      })
    }
    setOverlayOpen(OVERLAY_ID, false)
    setPhase('hidden')
  }, [milestone])

  const handleShare = useCallback(async () => {
    if (!milestone) return
    const message = referralCode
      ? shareReferralInvite(userName, referralCode).message
      : t('home.streak.shareText', { count: milestone })
    try {
      // Fonts are loaded by _layout boot; small RAF guards against a blank capture.
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      const uri = await captureRef.current?.capture()
      if (uri) {
        await shareCardImage(uri, { message, title: t('home.streak.shareTitle') }, {
          ...MOBILE_SHARE_CARD_CONTEXTS.streak,
          streak_weeks: milestone,
        })
      } else {
        await shareText({ message, url: WEB_BASE_URL })
      }
    } catch {
      // User cancelled the share sheet or capture failed — no-op.
    }
  }, [milestone, referralCode, userName, t])

  if (phase === 'loading' || phase === 'hidden' || milestone === null) return null

  return (
    <Modal
      transparent
      visible={phase === 'visible'}
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={handleDismiss}>
        <Pressable onPress={(e) => e.stopPropagation?.()}>
          <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
            {/* Fire + number */}
            <Text style={styles.fire}>🔥</Text>
            <Text className="font-bebas text-7xl text-lime-400 leading-none">
              {milestone}
            </Text>
            <Text className="font-bebas text-2xl text-white tracking-widest mt-1">
              {t('home.streak.share.label')}
            </Text>
            <Text className="font-sans-medium text-sm text-zinc-400 text-center mt-2 px-4">
              {t('home.streak.milestone', { count: milestone })}
            </Text>

            {/* Share */}
            <Button
              variant="outline"
              className="mt-6 border-lime-400/30 w-full"
              onPress={() => void handleShare()}
            >
              <Text className="font-mono text-xs tracking-widest text-lime-400 uppercase">
                {t('common.share')}
              </Text>
            </Button>

            {/* Dismiss */}
            <Button
              variant="ghost"
              className="mt-2 w-full"
              onPress={handleDismiss}
            >
              <Text className="font-mono text-xs text-zinc-500 uppercase tracking-widest">
                {t('common.close')}
              </Text>
            </Button>
          </Animated.View>

          {/* Off-screen share card (captured to PNG on share) */}
          <ShareCardCapture ref={captureRef} width={screenW} height={screenH}>
            <StreakShareCard
              streak={milestone}
              userName={userName}
              date={today}
              width={screenW}
              height={screenH}
            />
          </ShareCardCapture>
        </Pressable>
      </Pressable>
    </Modal>
  )
}


const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: 'rgba(163,230,53,0.25)',
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#a3e635',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  fire: {
    fontSize: 48,
    // Emoji needs an explicit, generous lineHeight or Android's tight default
    // line box crops the top/bottom of the glyph. textAlign centers the burst.
    lineHeight: 64,
    textAlign: 'center',
    marginBottom: 8,
  },
})
