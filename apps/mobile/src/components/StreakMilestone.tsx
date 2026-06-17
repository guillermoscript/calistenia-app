/**
 * StreakMilestone — center modal overlay for streak milestones.
 * On mount: checks AsyncStorage for unshown milestones.
 * If none → calls onDismiss immediately (renders null).
 * If found → shows modal, marks shown, offers share.
 */
import React, { useEffect, useState, useCallback } from 'react'
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native'
import { useRef } from 'react'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { haptics } from '@/lib/haptics'
import { shareText, shareReferralInvite } from '@/lib/share'
import {
  getActiveMilestone,
  getShownMilestones,
  markMilestoneShown,
} from '@/lib/streak-milestones'

export interface StreakMilestoneProps {
  streak: number
  userId: string
  userName: string
  referralCode?: string | null
  onDismiss: () => void
}

type Phase = 'loading' | 'visible' | 'hidden'

export default function StreakMilestone({
  streak,
  userId,
  userName,
  referralCode,
  onDismiss,
}: StreakMilestoneProps) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [milestone, setMilestone] = useState<number | null>(null)
  const scale = useRef(new Animated.Value(0.85)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    let cancelled = false
    async function check() {
      const shown = await getShownMilestones(userId)
      const active = getActiveMilestone(streak, shown)
      if (cancelled) return
      if (active === null) {
        onDismiss()
        return
      }
      setMilestone(active)
      await markMilestoneShown(userId, active)
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
  }, [userId, streak, onDismiss, scale, opacity])

  const handleDismiss = useCallback(() => {
    setPhase('hidden')
    onDismiss()
  }, [onDismiss])

  const handleShare = useCallback(async () => {
    if (!milestone) return
    try {
      if (referralCode) {
        const { message, url } = shareReferralInvite(userName, referralCode)
        await shareText({ message, url })
      } else {
        await shareText({
          message: `¡${milestone} días de racha en Calistenia App! 🔥`,
          url: 'https://gym.guille.tech',
        })
      }
    } catch {
      // silent
    }
  }, [milestone, referralCode, userName])

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
              DÍAS DE RACHA
            </Text>
            <Text className="font-sans-medium text-sm text-zinc-400 text-center mt-2 px-4">
              ¡{milestone} días seguidos entrenando! Sigue así 💪
            </Text>

            {/* Share */}
            <Button
              variant="outline"
              className="mt-6 border-lime-400/30 w-full"
              onPress={() => void handleShare()}
            >
              <Text className="font-mono text-xs tracking-widest text-lime-400 uppercase">
                COMPARTIR
              </Text>
            </Button>

            {/* Dismiss */}
            <Button
              variant="ghost"
              className="mt-2 w-full"
              onPress={handleDismiss}
            >
              <Text className="font-mono text-xs text-zinc-500 uppercase tracking-widest">
                Cerrar
              </Text>
            </Button>
          </Animated.View>
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
