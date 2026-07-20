/**
 * BadgeCelebrationDialog — celebración de badges de nutrición (#231).
 * Sustituye el Alert.alert nativo: dialog centrado estilo spec-sheet con
 * cola de badges (varios logros → un solo dialog en secuencia, no alerts
 * encadenados). Modal NATIVO (patrón StreakMilestone), no portal JS: en
 * Xiaomi/MIUI edge-to-edge los overlays JS colapsan insets.
 */
import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Modal, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useReducedMotion } from 'react-native-reanimated'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { haptics } from '@/lib/haptics'
import { BADGE_DEFINITIONS } from '@calistenia/core/lib/badge-definitions'
import type { BadgeType } from '@calistenia/core/types'

interface BadgeCelebrationDialogProps {
  /** Cola de badges a celebrar; vacía = oculto. */
  badges: BadgeType[]
  /** Se llama al cerrar (fin de cola o descarte); el padre vacía la cola. */
  onDone: () => void
}

export function BadgeCelebrationDialog({ badges, onDone }: BadgeCelebrationDialogProps) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const [idx, setIdx] = useState(0)
  const scale = useRef(new Animated.Value(0.92)).current
  const opacity = useRef(new Animated.Value(0)).current

  const visible = badges.length > 0
  const current = visible ? badges[Math.min(idx, badges.length - 1)] : null
  const def = current ? BADGE_DEFINITIONS[current] : null
  const isLast = idx >= badges.length - 1

  // La cola cambió (nueva tanda) → volver al primero.
  useEffect(() => { setIdx(0) }, [badges])

  // Entrada por cada badge mostrado: haptic + ease-out rápido (sin bounce).
  useEffect(() => {
    if (!visible || !def) return
    haptics.success()
    if (reduceMotion) {
      scale.setValue(1)
      opacity.setValue(1)
      return
    }
    scale.setValue(0.92)
    opacity.setValue(0)
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start()
  }, [visible, current]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible || !def) return null

  const advance = () => {
    if (isLast) onDone()
    else setIdx(i => i + 1)
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onDone}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onDone}>
        <Pressable onPress={(e) => e.stopPropagation?.()}>
          <Animated.View
            className="w-80 max-w-full items-center rounded-2xl border border-lime/40 bg-card px-6 py-8"
            style={{ opacity, transform: [{ scale }] }}
          >
            <Text className="font-mono text-[10px] uppercase tracking-[3px] text-lime">
              {t('badges.unlockedKicker')}
            </Text>
            <Text className="mt-5 text-6xl leading-none">{def.icon}</Text>
            <Text className="mt-4 font-bebas text-4xl leading-none text-foreground">
              {def.label}
            </Text>
            <Text className="mt-2 text-center font-sans text-sm text-muted-foreground">
              {def.description}
            </Text>
            {badges.length > 1 && (
              <Text className="mt-3 font-mono text-[10px] tracking-[2px] text-muted-foreground/60">
                {idx + 1} / {badges.length}
              </Text>
            )}
            <Button
              variant="outline"
              className="mt-6 w-full border-lime/40 active:bg-lime/10"
              onPress={advance}
            >
              <Text className="font-mono text-xs uppercase tracking-widest text-lime">
                {isLast ? t('badges.close') : t('badges.next')}
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    padding: 24,
  },
})
