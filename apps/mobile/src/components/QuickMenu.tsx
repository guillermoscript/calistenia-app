/**
 * Menú hamburguesa de acceso rápido — "hoja de especificaciones".
 *
 * Una sola hoja inferior compartida por todas las tabs vía contexto. El botón
 * ☰ (MenuButton) vive en la cabecera de cada tab y abre esta hoja con accesos
 * a las rutas que NO están en la barra de tabs.
 *
 * Jerarquía: ENTRENAR (las 2 acciones primarias) se renderiza como una fila
 * "héroe" de tiles grandes (Bebas, icono 26, borde lima) FUERA del scroll, así
 * está siempre visible al abrir. SOCIAL y MÁS van debajo como una MATRIZ de
 * líneas de 1px (panel de specs). Acento por sección (lima/azul/neutro), relleno
 * lima al pulsar, chevron persistente como pista de "navega". Cabecera con
 * kicker mono + Bebas. Lima es el color de interacción.
 *
 * Implementación: <Modal> NATIVO con animationType="slide" (mismo patrón que
 * CommentsSheet) en vez de un bottom-sheet JS — en Android edge-to-edge (MIUI)
 * la ventana queda sobre la barra de navegación y el compositor nunca colisiona.
 * El gesto de arrastrar-para-cerrar se limita a la cabecera para no pelear con
 * el scroll; cerrar por backdrop / ✕ / botón-atrás siempre funciona.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withSpring,
  withTiming,
  runOnJS,
  FadeInDown,
  type SharedValue,
} from 'react-native-reanimated'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  Menu,
  X,
  Sparkles,
  MapPin,
  Globe,
  Users,
  Trophy,
  Flag,
  Route as RouteIcon,
  Bell,
  AlarmClock,
  SlidersHorizontal,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'

// ── Estructura del menú ────────────────────────────────────────────────────────
// Solo rutas que NO están en la barra de tabs. Paridad con el sidebar de la web.
// Un acento por sección (no un arcoíris por item): lima = acción, azul = social,
// neutro = utilidad. Entrenar va primero: es la sección "héroe".

type MenuItem = { labelKey: string; href: Href; icon: LucideIcon }
type MenuSection = { titleKey: string; accent: string; items: MenuItem[] }

// Hues fijos que leen bien en claro y oscuro (mismos tonos que usa la app).
const ACCENT = {
  training: 'hsl(74 90% 45%)',
  social: '#0ea5e9',
  more: 'hsl(0 0% 55%)',
} as const

// Conteos PARES por sección → la matriz nunca deja una media celda vacía.
const SECTIONS: MenuSection[] = [
  {
    titleKey: 'nav.sectionTraining',
    accent: ACCENT.training,
    items: [
      { labelKey: 'nav.freeSession', href: '/free-session', icon: Sparkles },
      { labelKey: 'nav.cardio', href: '/cardio', icon: MapPin },
    ],
  },
  {
    titleKey: 'nav.sectionSocial',
    accent: ACCENT.social,
    items: [
      { labelKey: 'nav.community', href: '/social', icon: Globe },
      { labelKey: 'nav.friends', href: '/friends', icon: Users },
      { labelKey: 'nav.leaderboard', href: '/leaderboard', icon: Trophy },
      { labelKey: 'nav.challenges', href: '/challenges', icon: Flag },
    ],
  },
  {
    titleKey: 'nav.sectionMore',
    accent: ACCENT.more,
    items: [
      { labelKey: 'nav.races', href: '/races-discover', icon: RouteIcon },
      { labelKey: 'nav.notifications', href: '/notifications', icon: Bell },
      { labelKey: 'nav.reminders', href: '/reminders', icon: AlarmClock },
      { labelKey: 'nav.notificationSettings', href: '/notification-settings', icon: SlidersHorizontal },
    ],
  },
]

// Entrenar = héroe; el resto = matriz.
const [HERO_SECTION, ...MATRIX_SECTIONS] = SECTIONS

/** Agrupa en filas de 2 para una matriz estable (evita % + flex-wrap frágiles). */
function pairs<T>(arr: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2))
  return out
}

// ── Contexto ───────────────────────────────────────────────────────────────────

const QuickMenuContext = createContext<{ open: () => void } | null>(null)

export function useQuickMenu() {
  const ctx = useContext(QuickMenuContext)
  if (!ctx) throw new Error('useQuickMenu debe usarse dentro de <QuickMenuProvider>')
  return ctx
}

export function QuickMenuProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false)
  // El offset de arrastre vive aquí para poder ponerlo a 0 en open() ANTES de
  // montar/animar la hoja: así un cierre por gesto (que la deja fuera de
  // pantalla) nunca deja un offset residual que parpadee al reabrir.
  const translateY = useSharedValue(0)
  const open = useCallback(() => {
    translateY.value = 0
    haptics.selection()
    setVisible(true)
  }, [translateY])
  const close = useCallback(() => setVisible(false), [])
  // Valor estable: solo cambia si `open` cambia (nunca), así abrir/cerrar no
  // re-renderiza los MenuButton consumidores.
  const value = useMemo(() => ({ open }), [open])

  return (
    <QuickMenuContext.Provider value={value}>
      {children}
      <QuickMenuSheet visible={visible} onClose={close} translateY={translateY} />
    </QuickMenuContext.Provider>
  )
}

// ── Botón ☰ para las cabeceras ──────────────────────────────────────────────────

export function MenuButton({ className }: { className?: string }) {
  const { open } = useQuickMenu()
  const { t } = useTranslation()
  return (
    <Pressable
      onPress={open}
      hitSlop={8}
      className={cn(
        'size-10 items-center justify-center rounded-full border border-border bg-card active:opacity-70',
        className,
      )}
      accessibilityRole="button"
      accessibilityLabel={t('nav.openMenu')}
    >
      <Menu size={18} color="hsl(0 0% 55%)" />
    </Pressable>
  )
}

// ── Subcomponentes de la hoja ────────────────────────────────────────────────────

/** Divisor editorial: tick lima + label mono + filete. */
function SectionDivider({ label }: { label: string }) {
  return (
    <View className="mb-0.5 flex-row items-center gap-2 px-1">
      <View className="size-1.5 bg-lime" />
      <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{label}</Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  )
}

// ── Hoja ─────────────────────────────────────────────────────────────────────────

function QuickMenuSheet({
  visible,
  onClose,
  translateY,
}: {
  visible: boolean
  onClose: () => void
  translateY: SharedValue<number>
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { height: screenH } = useWindowDimensions()
  const reduceMotion = useReducedMotion()

  // Guard de una sola navegación: con animationType="slide" la hoja sigue
  // montada e interactiva durante el cierre, así que dos toques rápidos meterían
  // dos pantallas en el stack. Se resetea al mostrarse (onShow).
  const navigatingRef = useRef(false)

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }))

  const dragToClose = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(8)
        .onUpdate(e => {
          translateY.value = Math.max(0, e.translationY)
        })
        .onEnd(e => {
          const shouldClose = e.translationY > 90 || e.velocityY > 800
          if (shouldClose) {
            // Continuar el gesto hacia abajo hasta salir de pantalla y luego
            // cerrar (sin "snap up"); open() pondrá translateY a 0 al reabrir.
            if (reduceMotion) {
              runOnJS(onClose)()
            } else {
              translateY.value = withTiming(screenH, { duration: 220 }, finished => {
                if (finished) runOnJS(onClose)()
              })
            }
          } else {
            translateY.value = reduceMotion
              ? withTiming(0, { duration: 120 })
              : withSpring(0, { damping: 20, stiffness: 220 })
          }
        }),
    [translateY, screenH, reduceMotion, onClose],
  )

  const go = useCallback(
    (href: Href) => {
      if (navigatingRef.current) return
      navigatingRef.current = true
      haptics.selection()
      onClose()
      // Defer la navegación para que el cierre del Modal no pelee con el push.
      requestAnimationFrame(() => router.push(href))
    },
    [onClose, router],
  )

  // Stagger suave por bloque (héroe = 0, secciones = 1..n). El Modal nativo
  // desmonta/monta sus hijos en cada apertura, así que `entering` se reproduce
  // sola al abrir — sin necesidad de keys que cambien. reduceMotion lo omite.
  const entering = (index: number) =>
    reduceMotion ? undefined : FadeInDown.delay(index * 55).duration(200)

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
      onShow={() => {
        navigatingRef.current = false
      }}
    >
      {/* GestureHandlerRootView propio: el Modal es otra ventana nativa en Android. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1 }} pointerEvents="box-none">
          {/* Backdrop */}
          <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />

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
                    {/* Grabber con tinte de marca */}
                    <View className="items-center pb-2 pt-3">
                      <View className="h-1 w-9 rounded-full bg-lime/40" />
                    </View>

                    {/* Cabecera: kicker mono + Bebas, ✕ fantasma */}
                    <View className="flex-row items-end justify-between px-5 pb-3 pt-0">
                      <View>
                        <Text className="font-mono text-[9px] uppercase tracking-[3px] text-muted-foreground">
                          {t('nav.quickAccess')}
                        </Text>
                        <Text className="mt-0.5 font-bebas text-4xl leading-none text-foreground">{t('nav.menu')}</Text>
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

                {/* ── HÉROE: ENTRENAR — 2 tiles grandes, siempre visibles ── */}
                <Animated.View entering={entering(0)} className="gap-2 px-4 pb-3 pt-1">
                  <SectionDivider label={t(HERO_SECTION.titleKey)} />
                  <View className="flex-row gap-2">
                    {HERO_SECTION.items.map(item => {
                      const Icon = item.icon
                      return (
                        <Pressable
                          key={item.labelKey}
                          onPress={() => go(item.href)}
                          className="flex-1 items-center gap-2.5 rounded-xl border border-lime/30 bg-lime/5 px-3 py-5 active:border-lime/60 active:bg-lime/[0.12]"
                          accessibilityRole="button"
                          accessibilityLabel={t(item.labelKey)}
                        >
                          <Icon size={26} color={ACCENT.training} strokeWidth={1.5} />
                          <Text className="text-center font-bebas text-2xl leading-none tracking-wide text-foreground">
                            {t(item.labelKey)}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </Animated.View>

                {/* Separador héroe / matriz */}
                <View className="h-px bg-border" />

                {/* ── MATRIZ: SOCIAL + MÁS ── */}
                <ScrollView contentContainerClassName="gap-4 px-4 py-4 pb-2" showsVerticalScrollIndicator={false}>
                  {MATRIX_SECTIONS.map((section, i) => (
                    <Animated.View key={section.titleKey} entering={entering(i + 1)} className="gap-2.5">
                      <SectionDivider label={t(section.titleKey)} />

                      {/* Matriz de líneas de 1px */}
                      <View className="overflow-hidden rounded-lg border border-border">
                        {pairs(section.items).map((row, r) => (
                          <View key={r} className={cn('flex-row', r > 0 && 'border-t border-border')}>
                            {row.map((item, c) => {
                              const Icon = item.icon
                              return (
                                <Pressable
                                  key={item.labelKey}
                                  onPress={() => go(item.href)}
                                  className={cn(
                                    'flex-1 flex-row items-center gap-2.5 px-3 py-3.5 active:bg-lime/10',
                                    c > 0 && 'border-l border-border',
                                  )}
                                  accessibilityRole="button"
                                  accessibilityLabel={t(item.labelKey)}
                                >
                                  <Icon size={17} color={section.accent} />
                                  <Text
                                    className="flex-1 font-sans-medium text-[13px] leading-tight text-foreground"
                                    numberOfLines={2}
                                  >
                                    {t(item.labelKey)}
                                  </Text>
                                  <ChevronRight size={13} color={section.accent} style={{ opacity: 0.45 }} />
                                </Pressable>
                              )
                            })}
                            {/* Conteos pares ⇒ no debería darse, pero queda de red de seguridad */}
                            {row.length === 1 && <View className="flex-1 border-l border-border" />}
                          </View>
                        ))}
                      </View>
                    </Animated.View>
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
