/**
 * DiscoverSheet — sección «Descubre» de Perfil (issue #236): bottom sheet con
 * el directorio completo de features de la app agrupado por categoría, cada una
 * con icono + una línea de valor + deep link a su pantalla. Complementa a
 * «Novedades»: Novedades cuenta lo nuevo, Descubre cuenta todo.
 *
 * El catálogo vive en packages/core/data/features.json (bilingüe, patrón
 * changelog); añadir una feature = añadir una entrada al JSON. Los iconos se
 * referencian por nombre y se resuelven aquí con un mapa estático (sin eval).
 *
 * Implementación: <Modal> NATIVO con animationType="slide" (patrón
 * WhatsNewModal / CommentsSheet — no gorhom, robusto en MIUI edge-to-edge),
 * con drag-to-close en la cabecera.
 */
import { useMemo } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { useRouter, type Href } from 'expo-router'
import {
  Bell,
  BookOpen,
  Brain,
  CalendarDays,
  Camera,
  ChefHat,
  ChevronRight,
  ClipboardList,
  Compass,
  Flag,
  History,
  Image as ImageIcon,
  LayoutGrid,
  MapPin,
  Rss,
  ShoppingBasket,
  Sparkles,
  Star,
  Target,
  Timer,
  Trophy,
  Users,
  Watch,
  X,
  type LucideIcon,
} from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { COLORS } from '@/lib/theme'
import { op } from '@calistenia/core/lib/analytics'
import { groupFeatures, pickLang, type FeatureEntry } from '@calistenia/core/lib/discover'
import featuresJson from '@calistenia/core/data/features.json'

// Mapa nombre→icono: resolución estática de los nombres del JSON.
const ICONS: Record<string, LucideIcon> = {
  Bell,
  BookOpen,
  Brain,
  CalendarDays,
  Camera,
  ChefHat,
  ClipboardList,
  Flag,
  History,
  Image: ImageIcon,
  LayoutGrid,
  MapPin,
  Rss,
  ShoppingBasket,
  Sparkles,
  Star,
  Target,
  Timer,
  Trophy,
  Users,
  Watch,
}

// El catálogo es estático: se agrupa una sola vez al evaluar el módulo.
const GROUPS = groupFeatures(featuresJson as FeatureEntry[])

export function DiscoverSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { height: screenH } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const translateY = useSharedValue(0)

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }))

  const dragToClose = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(8)
        .onUpdate((e) => {
          translateY.set(Math.max(0, e.translationY))
        })
        .onEnd((e) => {
          const shouldClose = e.translationY > 90 || e.velocityY > 800
          if (shouldClose) {
            if (reduceMotion) {
              runOnJS(onClose)()
            } else {
              translateY.set(
                withTiming(screenH, { duration: 220 }, (finished) => {
                  if (finished) runOnJS(onClose)()
                }),
              )
            }
          } else {
            translateY.set(
              reduceMotion
                ? withTiming(0, { duration: 120 })
                : withSpring(0, { damping: 20, stiffness: 220 }),
            )
          }
        }),
    [translateY, screenH, reduceMotion, onClose],
  )

  const handleFeaturePress = (f: FeatureEntry) => {
    op.track('discover_feature_tapped', { feature_id: f.id })
    if (!f.route) return
    onClose()
    // El Modal es otra ventana nativa: dejarla cerrar antes de navegar evita
    // glitches de foco en Android/MIUI (mismo patrón que OptionSheet).
    const route = f.route as Href
    setTimeout(() => router.push(route), 250)
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
      onShow={() => {
        translateY.set(0)
        op.track('discover_opened')
      }}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1 }} pointerEvents="box-none">
          {/* Backdrop */}
          <Pressable
            onPress={onClose}
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />

          {/* Hoja anclada abajo */}
          <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
            <Animated.View style={[{ width: '100%' }, sheetStyle]}>
              <View
                className="border-t border-border bg-card"
                style={{
                  maxHeight: screenH * 0.86,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  overflow: 'hidden',
                  paddingBottom: insets.bottom + 14,
                }}
              >
                {/* Zona de arrastre: grabber + cabecera */}
                <GestureDetector gesture={dragToClose}>
                  <View>
                    <View className="items-center pb-2 pt-3">
                      <View className="h-1 w-9 rounded-full bg-lime/40" />
                    </View>

                    <View className="flex-row items-start justify-between px-5 pb-2 pt-0">
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Compass size={12} color={COLORS.lime} />
                          <Text className="font-mono text-[9px] uppercase tracking-[3px] text-muted-foreground">
                            {t('discover.kicker')}
                          </Text>
                        </View>
                        <Text className="mt-1 font-bebas text-4xl leading-none text-foreground">
                          {t('discover.title')}
                        </Text>
                      </View>
                      <Pressable
                        onPress={onClose}
                        hitSlop={10}
                        className="size-9 items-center justify-center rounded-full bg-muted active:opacity-70"
                        accessibilityRole="button"
                        accessibilityLabel={t('common.close')}
                      >
                        <X size={17} color="hsl(0 0% 55%)" />
                      </Pressable>
                    </View>
                  </View>
                </GestureDetector>

                <View className="mx-5 h-px bg-border" />

                {/* Directorio desplazable, agrupado por categoría */}
                <ScrollView contentContainerClassName="pb-4" showsVerticalScrollIndicator={false}>
                  {GROUPS.map((group) => (
                    <View key={group.category}>
                      <Text className="px-5 pb-1 pt-4 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                        {t(`discover.category.${group.category}`)}
                      </Text>
                      {group.features.map((f) => {
                        const Icon = ICONS[f.icon] ?? Compass
                        return (
                          <Pressable
                            key={f.id}
                            disabled={!f.route}
                            onPress={() => handleFeaturePress(f)}
                            className="flex-row items-center gap-3 border-t border-border px-5 py-3 active:bg-lime/10"
                            accessibilityRole={f.route ? 'button' : undefined}
                          >
                            <View className="size-9 items-center justify-center rounded-full bg-muted">
                              <Icon size={16} color={COLORS.mutedIcon} />
                            </View>
                            <View className="flex-1">
                              <Text className="font-sans-medium text-sm text-foreground">
                                {pickLang(f.title, i18n.language)}
                              </Text>
                              <Text className="mt-0.5 text-xs leading-snug text-muted-foreground">
                                {pickLang(f.body, i18n.language)}
                              </Text>
                            </View>
                            {f.route && <ChevronRight size={16} color={COLORS.mutedIcon} />}
                          </Pressable>
                        )
                      })}
                    </View>
                  ))}
                </ScrollView>
              </View>
            </Animated.View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}
