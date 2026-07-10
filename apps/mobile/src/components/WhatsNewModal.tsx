/**
 * "Novedades" — hoja inferior que se desliza al abrir la app por primera vez tras
 * una actualización. Muestra los cambios curados (resumen + highlights bilingües)
 * de cada versión nueva en el idioma del usuario; los commits crudos quedan tras
 * un expander "Detalles técnicos".
 *
 * Auto-decide su visibilidad: lee la versión instalada (expo-constants) y la
 * última versión vista (storage); si hay versiones sin ver, se abre sola tras un
 * breve retardo. Al cerrar (✕ / backdrop / arrastrar / botón-atrás) marca la
 * versión instalada como vista, así no reaparece hasta la siguiente.
 *
 * Implementación: <Modal> NATIVO con animationType="slide" (mismo patrón que
 * QuickMenu / CommentsSheet) — robusto en Android edge-to-edge (MIUI). Se monta
 * en la Home (primera pantalla tras login/onboarding), no a nivel raíz, para
 * aparecer solo cuando el usuario llega al inicio y nunca durante una sesión.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import Constants from 'expo-constants'
import { ChevronDown, X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { haptics } from '@/lib/haptics'
import { syncStorage } from '@/lib/storage'
import {
  compareVersions,
  dotColorForType,
  getUnseenVersions,
  pickLang,
  type ChangelogData,
  type ChangelogVersion,
} from '@calistenia/core/lib/whats-new'
import changelogJson from '@calistenia/core/data/changelog.mobile.json'

const CHANGELOG = changelogJson as ChangelogData
const LIME = 'hsl(74 90% 45%)'
/** Propia de mobile: la web trackea "visto" por su cuenta con su propia clave. */
const WHATS_NEW_STORAGE_KEY = 'calistenia_mobile_last_seen_version'

function getCurrentVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0'
}

// ── Punto lima pulsante (delight sutil, respeta reduce-motion) ──────────────────

function PulseDot({ reduceMotion }: { reduceMotion: boolean }) {
  const opacity = useSharedValue(1)
  useEffect(() => {
    if (reduceMotion) return
    opacity.set(withRepeat(withSequence(withTiming(0.3, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false))
  }, [opacity, reduceMotion])
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }))
  return (
    <Animated.View style={style}>
      <View className="size-1.5 rounded-full" style={{ backgroundColor: LIME }} />
    </Animated.View>
  )
}

// ── Entry point: auto-decide visibilidad ───────────────────────────────────────

export default function WhatsNewModal() {
  const { i18n } = useTranslation()
  const reduceMotion = useReducedMotion()

  // Versión instalada y versiones sin ver: se calculan una vez al montar la Home.
  const current = useMemo(() => getCurrentVersion(), [])
  const [unseen] = useState<ChangelogVersion[]>(() =>
    getUnseenVersions(CHANGELOG.versions, current, syncStorage.getItem(WHATS_NEW_STORAGE_KEY)),
  )
  // Versiones publicadas más viejas que las sin ver: se revelan con "ver anteriores".
  const older = useMemo(
    () =>
      CHANGELOG.versions.filter(
        (v) =>
          compareVersions(v.version, current) <= 0 &&
          !unseen.some((u) => u.version === v.version),
      ),
    [current, unseen],
  )
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (unseen.length === 0) return
    const id = setTimeout(
      () => {
        setVisible(true)
        haptics.selection()
      },
      reduceMotion ? 250 : 700,
    )
    return () => clearTimeout(id)
  }, [unseen.length, reduceMotion])

  const dismiss = useCallback(() => {
    // Marca la versión INSTALADA como vista (no la del changelog) para que la
    // detección quede coherente con compareVersions en el próximo arranque.
    syncStorage.setItem(WHATS_NEW_STORAGE_KEY, current)
    setVisible(false)
  }, [current])

  if (unseen.length === 0) return null

  return (
    <WhatsNewSheet
      visible={visible}
      versions={unseen}
      olderVersions={older}
      lang={i18n.language}
      reduceMotion={reduceMotion}
      onClose={dismiss}
    />
  )
}

// ── Historial: hoja reabrible (desde Perfil) con TODAS las versiones publicadas ──

export function ChangelogHistory({
  visible,
  onClose,
}: {
  visible: boolean
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const reduceMotion = useReducedMotion()
  const current = useMemo(() => getCurrentVersion(), [])
  // Todas las versiones que el usuario ya tiene (<= instalada), más nueva primero.
  const released = useMemo(
    () => CHANGELOG.versions.filter((v) => compareVersions(v.version, current) <= 0),
    [current],
  )
  if (released.length === 0) return null
  return (
    <WhatsNewSheet
      visible={visible}
      versions={released}
      lang={i18n.language}
      reduceMotion={reduceMotion}
      onClose={onClose}
      kicker={t('whatsNew.historyKicker')}
    />
  )
}

// ── Hoja ───────────────────────────────────────────────────────────────────────

function WhatsNewSheet({
  visible,
  versions,
  olderVersions,
  lang,
  reduceMotion,
  onClose,
  kicker,
}: {
  visible: boolean
  versions: ChangelogVersion[]
  /** Versiones más viejas, ocultas tras "ver anteriores". Opcional. */
  olderVersions?: ChangelogVersion[]
  lang: string
  reduceMotion: boolean
  onClose: () => void
  /** Texto del kicker de cabecera (por defecto "Novedades"). */
  kicker?: string
}) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { height: screenH } = useWindowDimensions()
  const translateY = useSharedValue(0)
  const [showDetails, setShowDetails] = useState(false)
  const [showOlder, setShowOlder] = useState(false)

  // La versión más nueva encabeza la hoja; el cuerpo lista las visibles (y las
  // anteriores si el usuario las desplegó).
  const headVersion = versions[0]
  const shownVersions = useMemo(
    () => (showOlder && olderVersions?.length ? [...versions, ...olderVersions] : versions),
    [showOlder, olderVersions, versions],
  )
  const hasGroups = shownVersions.some((v) => v.groups && v.groups.length > 0)
  const hasOlder = !!olderVersions?.length && !showOlder

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

  const entering = (index: number) =>
    reduceMotion ? undefined : FadeInDown.delay(index * 55).duration(220)

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
      onShow={() => {
        translateY.set(0)
        setShowDetails(false)
        setShowOlder(false)
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
                          <PulseDot reduceMotion={reduceMotion} />
                          <Text className="font-mono text-[9px] uppercase tracking-[3px] text-muted-foreground">
                            {kicker ?? t('whatsNew.kicker')}
                          </Text>
                        </View>
                        <View className="mt-1 flex-row items-end gap-2">
                          <Text className="font-bebas text-4xl leading-none text-foreground">
                            v{headVersion.version}
                          </Text>
                          <Text className="pb-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/60">
                            {formatDate(headVersion.date, lang)}
                          </Text>
                        </View>
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

                {/* Cuerpo desplazable: resumen + highlights por versión */}
                <ScrollView
                  contentContainerClassName="px-5 py-4 gap-5"
                  showsVerticalScrollIndicator={false}
                >
                  {shownVersions.map((version, vi) => (
                    <Animated.View key={version.version} entering={entering(vi)} className="gap-3">
                      {/* Etiqueta de versión solo si hay más de una en la hoja */}
                      {shownVersions.length > 1 && (
                        <View className="flex-row items-center gap-2">
                          <View className="size-1.5 bg-lime" />
                          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                            v{version.version} · {formatDate(version.date, lang)}
                          </Text>
                          <View className="h-px flex-1 bg-border" />
                        </View>
                      )}

                      {/* Resumen */}
                      <Text className="text-[13px] leading-snug text-muted-foreground">
                        {pickLang(version.summary, lang)}
                      </Text>

                      {/* Highlights */}
                      <View className="gap-3.5">
                        {version.highlights.map((h, i) => (
                          <View key={i} className="flex-row gap-3">
                            <View className="w-7 items-center pt-0.5">
                              <Text className="text-[19px] leading-none">{h.icon}</Text>
                            </View>
                            <View className="flex-1">
                              <View className="flex-row items-center gap-2">
                                <View
                                  className="size-1.5 rounded-full"
                                  style={{ backgroundColor: dotColorForType(h.type) }}
                                />
                                <Text className="font-sans-bold text-[15px] leading-tight text-foreground">
                                  {pickLang(h.title, lang)}
                                </Text>
                              </View>
                              <Text className="mt-1 text-[13px] leading-snug text-muted-foreground">
                                {pickLang(h.body, lang)}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </Animated.View>
                  ))}

                  {/* Ver versiones anteriores — revela el historial más viejo */}
                  {hasOlder && (
                    <Pressable
                      onPress={() => setShowOlder(true)}
                      className="flex-row items-center gap-2 py-1 active:opacity-70"
                      accessibilityRole="button"
                    >
                      <ChevronDown size={14} color="hsl(0 0% 55%)" />
                      <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                        {t('whatsNew.seeOlder')} ({olderVersions!.length})
                      </Text>
                    </Pressable>
                  )}

                  {/* Expander "Detalles técnicos" — commits crudos */}
                  {hasGroups && (
                    <View className="gap-2">
                      <Pressable
                        onPress={() => setShowDetails((s) => !s)}
                        className="flex-row items-center gap-2 py-1 active:opacity-70"
                        accessibilityRole="button"
                      >
                        <ChevronDown
                          size={14}
                          color="hsl(0 0% 55%)"
                          style={{ transform: [{ rotate: showDetails ? '180deg' : '0deg' }] }}
                        />
                        <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                          {t('whatsNew.details')}
                        </Text>
                      </Pressable>

                      {showDetails && (
                        <View className="gap-3 rounded-lg border border-border bg-background p-3">
                          {shownVersions.flatMap((version) =>
                            (version.groups ?? []).map((group) => (
                              <View key={`${version.version}-${group.type}`} className="gap-1.5">
                                <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground/70">
                                  {group.emoji} {group.label}
                                </Text>
                                {group.items.map((item, ii) => (
                                  <View key={ii} className="flex-row gap-2 pl-1">
                                    <Text className="text-muted-foreground/40">·</Text>
                                    <Text className="flex-1 text-[12px] leading-snug text-muted-foreground/80">
                                      {item.scope ? (
                                        <Text className="text-muted-foreground/50">{item.scope} — </Text>
                                      ) : null}
                                      {item.description}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )),
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </ScrollView>

                {/* Footer CTA */}
                <View className="px-5 pt-2">
                  <Pressable
                    onPress={onClose}
                    className="items-center rounded-xl border border-lime/30 bg-lime/5 py-3.5 active:border-lime/60 active:bg-lime/[0.12]"
                    accessibilityRole="button"
                  >
                    <Text className="font-bebas text-2xl tracking-wide text-foreground">
                      {t('whatsNew.gotIt')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

function formatDate(iso: string, lang: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString(lang.startsWith('en') ? 'en' : 'es', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return iso
  }
}
