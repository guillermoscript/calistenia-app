/**
 * PRCelebration — RN top-toast overlay for new personal records.
 * Slides in from top (RN Animated), auto-dismisses after 8s.
 * On "COMPARTIR": renders PRShareCard off-screen via ShareCardCapture,
 * captures PNG, shares via shareImage().
 */
import React, { useEffect, useRef, useCallback } from 'react'
import { Animated, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { haptics } from '@/lib/haptics'
import { shareImage, sharePR } from '@/lib/share'
import PRShareCard from '@/components/share/PRShareCard'
import ShareCardCapture, {
  type ShareCardCaptureHandle,
} from '@/components/share/ShareCardCapture'
import type { PREvent } from '@calistenia/core/hooks/useProgress'

export interface PRCelebrationProps {
  prEvent: PREvent
  exerciseName: string
  userName: string
  avatarUrl?: string | null
  referralCode?: string | null
  onDismiss: () => void
}

export default function PRCelebration({
  prEvent,
  exerciseName,
  userName,
  avatarUrl,
  referralCode,
  onDismiss,
}: PRCelebrationProps) {
  const insets = useSafeAreaInsets()
  const translateY = useRef(new Animated.Value(-200)).current
  const captureRef = useRef<ShareCardCaptureHandle>(null)

  // Haptic + slide-in on mount
  useEffect(() => {
    haptics.success()
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 14,
      stiffness: 160,
    }).start()

    const timer = setTimeout(onDismiss, 8000)
    return () => clearTimeout(timer)
  }, [onDismiss, translateY])

  const handleShare = useCallback(async () => {
    try {
      const uri = await captureRef.current?.capture()
      if (!uri) return
      const { message } = sharePR({
        exerciseName,
        oldValue: prEvent.oldValue,
        newValue: prEvent.newValue,
        userName,
        referralCode,
      })
      await shareImage(uri, { message })
    } catch (e) {
      // silent – share not available
    }
  }, [exerciseName, prEvent, userName, referralCode])

  return (
    <>
      {/* Off-screen capture target */}
      <ShareCardCapture ref={captureRef}>
        <PRShareCard
          exerciseName={exerciseName}
          oldValue={prEvent.oldValue}
          newValue={prEvent.newValue}
          userName={userName}
          avatarUrl={avatarUrl}
          referralCode={referralCode}
        />
      </ShareCardCapture>

      {/* Toast overlay */}
      <Animated.View
        style={[
          styles.container,
          { top: insets.top + 12, transform: [{ translateY }] },
        ]}
        pointerEvents="box-none"
      >
        <Pressable onPress={onDismiss} style={styles.card}>
          {/* Trophy */}
          <Text style={styles.trophy}>🏆</Text>

          {/* Content */}
          <View style={styles.content}>
            <Text className="font-mono text-[10px] tracking-widest text-lime-400 uppercase">
              NUEVO RÉCORD
            </Text>
            <Text className="font-bebas text-base text-white mt-0.5" numberOfLines={1}>
              {exerciseName}
            </Text>
            <View style={styles.valueRow}>
              <Text className="font-mono text-xs text-zinc-500">
                {prEvent.oldValue ?? '—'}
              </Text>
              <Text className="font-mono text-xs text-lime-400 mx-1.5">→</Text>
              <Text className="font-mono-semibold text-xs text-lime-400">
                {prEvent.newValue} reps
              </Text>
            </View>
          </View>

          {/* Share button — stopPropagation via onPress not calling onDismiss */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.()
              void handleShare()
            }}
            style={styles.shareBtn}
          >
            <Button
              variant="outline"
              size="sm"
              className="border-lime-400/25 shrink-0"
              onPress={(e) => {
                e.stopPropagation?.()
                void handleShare()
              }}
            >
              <Text className="font-mono text-[10px] tracking-widest text-lime-400 uppercase">
                COMPARTIR
              </Text>
            </Button>
          </Pressable>
        </Pressable>
      </Animated.View>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: 'rgba(163,230,53,0.3)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#a3e635',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  trophy: {
    fontSize: 28,
    flexShrink: 0,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  shareBtn: {
    flexShrink: 0,
  },
})
