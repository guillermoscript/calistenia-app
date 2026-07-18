/**
 * GettingStartedCard — checklist «Primeros pasos» del Home (issue #233).
 *
 * Card colapsable con los 6 ítems de activación (programa, primer entreno,
 * comida, cardio, foto de progreso, seguir a un amigo), barra de progreso y
 * CTAs que navegan a la pantalla donde se completa cada ítem. Desaparece para
 * siempre al completarse los 6 o al pulsar «Ocultar» (flags en syncStorage por
 * usuario y dispositivo).
 *
 * El wrapper (export default) decide si renderiza y el componente interno es
 * quien monta los hooks de datos extra — así los usuarios que ya descartaron
 * la card no pagan las queries de nutrición/cardio/fotos/follows.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter, type Href } from 'expo-router'
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import {
  Apple,
  Camera,
  Check,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  MapPin,
  UserPlus,
  type LucideIcon,
} from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { syncStorage } from '@/lib/storage'
import { COLORS } from '@/lib/theme'
import { op } from '@calistenia/core/lib/analytics'
import {
  deriveChecklist,
  checklistDismissedKey,
  checklistCompletedKey,
  type ChecklistItemId,
} from '@calistenia/core/lib/getting-started'
import { useNutrition } from '@calistenia/core/hooks/useNutrition'
import { useCardioSessions } from '@calistenia/core/hooks/useCardioStats'
import { useBodyPhotos } from '@calistenia/core/hooks/useBodyPhotos'
import { useFollows } from '@calistenia/core/hooks/useFollows'

const ITEM_META: Record<ChecklistItemId, { icon: LucideIcon; route: Href }> = {
  program: { icon: ClipboardList, route: '/programs' },
  workout: { icon: Dumbbell, route: '/programs' },
  meal: { icon: Apple, route: '/nutrition' },
  cardio: { icon: MapPin, route: '/cardio' },
  photo: { icon: Camera, route: '/progress-photos' },
  friend: { icon: UserPlus, route: '/friends' },
}

interface GettingStartedCardProps {
  userId: string | null
  hasActiveProgram: boolean
  totalSessions: number
  programsReady: boolean
  /** Con programa activo, «primer entreno» sube al hero en vez de navegar. */
  onWorkoutTap: () => void
}

function GettingStartedCard(props: GettingStartedCardProps) {
  const { userId } = props
  // Bump para re-leer los flags de storage tras «Ocultar» (desmonta el inner).
  const [, setDismissedTick] = useState(0)
  const onDismiss = useCallback(() => setDismissedTick(t => t + 1), [])

  const hidden =
    !userId ||
    syncStorage.getItem(checklistDismissedKey(userId)) === 'true' ||
    syncStorage.getItem(checklistCompletedKey(userId)) === 'true'
  if (hidden) return null

  return <GettingStartedInner {...props} userId={userId} onDismiss={onDismiss} />
}

function GettingStartedInner({
  userId,
  hasActiveProgram,
  totalSessions,
  programsReady,
  onWorkoutTap,
  onDismiss,
}: Omit<GettingStartedCardProps, 'userId'> & { userId: string; onDismiss: () => void }) {
  const { t } = useTranslation()
  const router = useRouter()
  const [expanded, setExpanded] = useState(true)

  // useNutrition y useCardioSessions comparten query key con HomeActivity —
  // solo fotos y follows añaden fetches, y únicamente mientras la card viva.
  const { entries, isReady: nutritionReady } = useNutrition(userId)
  const { sessions: cardioSessions, isLoading: cardioLoading } = useCardioSessions(userId)
  const { photos, isReady: photosReady } = useBodyPhotos(userId)
  const { followingCount, loading: followsLoading } = useFollows(userId)

  const ready = programsReady && nutritionReady && photosReady && !cardioLoading && !followsLoading

  const { items, doneCount, total, allDone } = deriveChecklist({
    hasActiveProgram,
    totalSessions,
    mealCount: entries.length,
    cardioCount: cardioSessions.length,
    photoCount: photos.length,
    followingCount,
  })

  // Rotación del caret — mismo idioma que InsightsCard, honra reduce-motion.
  const reduceMotion = useReducedMotion()
  const caretRotation = useSharedValue(0)
  useEffect(() => {
    caretRotation.set(
      withTiming(expanded ? 180 : 0, { duration: reduceMotion ? 1 : 180, easing: Easing.out(Easing.quad) }),
    )
  }, [expanded, reduceMotion, caretRotation])
  const caretStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${caretRotation.get()}deg` }] }))

  // Auto-completado: al llegar a 6/6 marca el flag (el próximo mount ya no
  // renderiza) y deja visible la celebración durante este mount.
  const completedRef = useRef(false)
  useEffect(() => {
    if (!ready || !allDone || completedRef.current) return
    completedRef.current = true
    if (syncStorage.getItem(checklistCompletedKey(userId)) !== 'true') {
      syncStorage.setItem(checklistCompletedKey(userId), 'true')
      op.track('checklist_completed')
    }
  }, [ready, allDone, userId])

  const handleItemPress = useCallback(
    (id: ChecklistItemId) => {
      op.track('checklist_item_tapped', { item: id })
      if (id === 'workout' && hasActiveProgram) {
        onWorkoutTap()
        return
      }
      router.push(ITEM_META[id].route)
    },
    [hasActiveProgram, onWorkoutTap, router],
  )

  const handleHide = useCallback(() => {
    syncStorage.setItem(checklistDismissedKey(userId), 'true')
    op.track('checklist_dismissed', { completed_count: doneCount })
    onDismiss()
  }, [userId, doneCount, onDismiss])

  // Sin flash de 0/6: no renderizar hasta que todas las queries estén listas.
  if (!ready) return null

  return (
    <View className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header: kicker + contador + caret (toggle) */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable
          onPress={() => setExpanded(v => !v)}
          className="flex-1 flex-row items-center active:opacity-70"
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
            {t('dashboard.checklist.kicker')}
          </Text>
        </Pressable>
        <View className="flex-row items-center gap-3">
          <Text className="font-bebas text-xl leading-none text-foreground">
            {doneCount}<Text className="font-bebas text-xl leading-none text-muted-foreground">/{total}</Text>
          </Text>
          <Pressable onPress={() => setExpanded(v => !v)} hitSlop={8} accessibilityRole="button">
            <Animated.View style={caretStyle}>
              <Text className="font-mono text-[11px] text-muted-foreground">▼</Text>
            </Animated.View>
          </Pressable>
        </View>
      </View>

      {/* Barra de progreso — siempre visible, también colapsada */}
      <View className={cn('mx-4 h-1 overflow-hidden rounded-full bg-muted', !expanded && 'mb-3')}>
        <View className="h-full rounded-full bg-lime" style={{ width: `${(doneCount / total) * 100}%` }} />
      </View>

      {expanded && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)}>
          {allDone ? (
            /* Celebración breve (texto, sin confetti) — solo este mount */
            <View className="items-center gap-1 px-4 pb-4 pt-3">
              <Text className="font-bebas text-2xl leading-none text-lime">
                {t('dashboard.checklist.title')}
              </Text>
              <Text className="text-center text-sm text-muted-foreground">
                {t('dashboard.checklist.done')}
              </Text>
            </View>
          ) : (
            <View className="mt-3">
              {items.map(item => {
                const Icon = ITEM_META[item.id].icon
                return (
                  <Pressable
                    key={item.id}
                    disabled={item.done}
                    onPress={() => handleItemPress(item.id)}
                    className={cn(
                      'flex-row items-center gap-3 border-t border-border px-4 py-3',
                      !item.done && 'active:bg-lime/10',
                    )}
                    accessibilityRole={item.done ? undefined : 'button'}
                  >
                    <View
                      className={cn(
                        'size-9 items-center justify-center rounded-full',
                        item.done ? 'bg-lime/10' : 'bg-muted',
                      )}
                    >
                      {item.done ? (
                        <Check size={16} color={COLORS.lime} />
                      ) : (
                        <Icon size={16} color={COLORS.mutedIcon} />
                      )}
                    </View>
                    <View className="flex-1">
                      <Text
                        className={cn(
                          'font-sans-medium text-sm',
                          item.done ? 'text-muted-foreground line-through' : 'text-foreground',
                        )}
                      >
                        {t(`dashboard.checklist.item.${item.id}`)}
                      </Text>
                      {!item.done && (
                        <Text className="mt-0.5 text-xs text-muted-foreground">
                          {t(`dashboard.checklist.item.${item.id}Desc`)}
                        </Text>
                      )}
                    </View>
                    {!item.done && <ChevronRight size={16} color={COLORS.mutedIcon} />}
                  </Pressable>
                )
              })}
            </View>
          )}

          {/* «Ocultar» — descarte permanente para este usuario y dispositivo */}
          <Pressable
            onPress={handleHide}
            className="items-center border-t border-border py-2.5 active:opacity-70"
            accessibilityRole="button"
          >
            <Text className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t('dashboard.checklist.hide')}
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  )
}

export default React.memo(GettingStartedCard)
