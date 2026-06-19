// init-core DEBE evaluarse antes que cualquier módulo de @calistenia/core.
import '@/lib/init-core'
import '../global.css'
// Registra setNotificationHandler app-wide (rest timer + recordatorios) al boot.
import '@/lib/notifications'

import { useEffect, useState, useRef, type ReactNode } from 'react'
import { Platform } from 'react-native'
import { Stack, ThemeProvider, usePathname, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Notifications from 'expo-notifications'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { colorScheme as nwColorScheme, useColorScheme } from 'nativewind'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { PortalHost } from '@rn-primitives/portal'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createQueryClient, createCorePersister, setupOnlineManager, PERSIST_MAX_AGE } from '@calistenia/core/lib/query-client'
import { useRestPreferences } from '@calistenia/core/hooks/useRestPreferences'
import { useWeight } from '@calistenia/core/hooks/useWeight'
import { pb } from '@calistenia/core/lib/pocketbase'
import { setupAutoSync } from '@calistenia/core/lib/offlineQueue'

import { Sentry } from '@/lib/instrument'
import { FONTS } from '@/lib/fonts'
import { pbAuthHydration, trackScreen } from '@/lib/init-core'
import { hydrateStorage } from '@/lib/storage'
import { initI18n } from '@/lib/i18n'
import { NAV_THEME } from '@/lib/theme'
import { useAuthUser } from '@/lib/use-auth-user'
import { WorkoutProvider } from '@/contexts/WorkoutContext'
import { ActiveSessionProvider } from '@/contexts/ActiveSessionContext'
import { CardioSessionProvider } from '@/contexts/CardioSessionContext'
import OfflineBanner from '@/components/OfflineBanner'

SplashScreen.preventAutoHideAsync()

// ---------------------------------------------------------------------------
// Notification deep-link routing
// ---------------------------------------------------------------------------

/**
 * Translates a web-style path from a push notification payload to the
 * closest expo-router route in the app.
 *
 * Incoming paths (examples): '/feed', '/u/<id>', '/challenges/<id>',
 * '/progress', '/profile', '/referrals', '/notifications'.
 */
function resolveNotifRoute(url: string): Parameters<ReturnType<typeof useRouter>['push']>[0] | null {
  if (!url) return null
  // Normalize: trim trailing slash
  const path = url.replace(/\/$/, '')

  if (path === '/feed' || path === '/') return '/'
  if (path.startsWith('/u/')) return path as `/u/${string}`
  if (path === '/progress' || path === '/history') return '/history'
  if (path === '/profile') return '/profile'
  if (path === '/notifications') return '/notifications'
  if (path === '/challenges' || path.startsWith('/challenges')) return '/challenges'
  if (path === '/social') return '/social'
  if (path === '/referrals') return '/notifications'
  return '/notifications'
}

// Singletons a nivel módulo: un único QueryClient/persister por vida de la app.
// init-core ya corrió (primer import del archivo), así que el adapter está listo.
setupOnlineManager()
const queryClient = createQueryClient()
const persister = createCorePersister()
// darkMode: 'class' en tailwind.config → NativeWind controla la clase .dark;
// 'system' sigue el modo del dispositivo (igual que el default de la web).
nwColorScheme.set('system')

function Providers({ children }: { children: ReactNode }) {
  const user = useAuthUser()
  const { getRestForExercise, setRestForExercise } = useRestPreferences(user?.id ?? null)
  // Peso más reciente para estimar calorías de cardio (igual que la web)
  const { getWeightHistory } = useWeight(user?.id ?? null)
  const latestWeight = getWeightHistory(1)[0]?.weight_kg
  return (
    <WorkoutProvider userId={user?.id ?? null}>
      <ActiveSessionProvider getRestForExercise={getRestForExercise} setRestForExercise={setRestForExercise}>
        <CardioSessionProvider userId={user?.id ?? null} userWeight={latestWeight}>
          <BottomSheetModalProvider>{children}</BottomSheetModalProvider>
        </CardioSessionProvider>
      </ActiveSessionProvider>
    </WorkoutProvider>
  )
}

function RootLayout() {
  const { colorScheme } = useColorScheme()
  const [ready, setReady] = useState(false)
  // fontError: seguir sin fuentes custom antes que quedarse en blanco
  const [fontsLoaded, fontError] = useFonts(FONTS)

  // OpenPanel screen views (la web los auto-trackea; en RN es manual).
  const pathname = usePathname()
  const segments = useSegments()
  useEffect(() => {
    trackScreen(pathname, { segments: segments.join('/'), platform: 'mobile' })
  }, [pathname, segments])

  // Reintenta acciones encoladas offline al recuperar conexión (igual que web).
  // Tras vaciar la cola, invalida queries para reconciliar ids optimistas (local_)
  // con los reales del server.
  useEffect(() => setupAutoSync(pb, () => queryClient.invalidateQueries()), [])

  // ── Notification tap deep-link routing ────────────────────────────────────
  // useRouter must be called inside the component; we store a ref so the
  // effect below doesn't need router in its dep array (stable reference).
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router

  useEffect(() => {
    // COLD START: if the app was opened by tapping a notification, handle it once.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return
      const url = response.notification.request.content.data?.url as string | undefined
      if (url) {
        const route = resolveNotifRoute(url)
        if (route) routerRef.current.push(route)
      }
    }).catch(() => { /* ignore */ })

    // FOREGROUND / BACKGROUND TAP: listener for subsequent taps.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url as string | undefined
      if (url) {
        const route = resolveNotifRoute(url)
        if (route) routerRef.current.push(route)
      }
    })

    return () => sub.remove()
  }, [])  // intentionally empty — runs once on mount

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      // Sesión PB persistida + caché síncrona de storage, antes de pintar nada.
      await Promise.all([hydrateStorage(), pbAuthHydration])
      initI18n()
      if (!cancelled) setReady(true)
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [])

  const fontsReady = fontsLoaded || !!fontError
  useEffect(() => {
    if (ready && fontsReady) SplashScreen.hideAsync()
  }, [ready, fontsReady])

  if (!ready || !fontsReady) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: PERSIST_MAX_AGE }}
      >
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <KeyboardProvider>
        <ThemeProvider value={NAV_THEME[colorScheme === 'dark' ? 'dark' : 'light']}>
        <StatusBar style="auto" />
        <Providers>
          <Stack screenOptions={{
            headerShown: false,
            // iOS: native spring-based push (UINavigationController feel)
            // Android: explicit slide to match iOS instead of the default crossfade
            animation: Platform.OS === 'ios' ? 'default' : 'slide_from_right',
          }}>
            <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
            <Stack.Screen name="login" options={{ animation: 'fade' }} />
            {/* Onboarding: full-screen, no header, gesture disabled so user can't swipe back */}
            <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
            {/* Session slides up like a modal — can't gesture-dismiss mid-workout */}
            <Stack.Screen name="session" options={{ gestureEnabled: false, animation: 'slide_from_bottom' }} />
          </Stack>
        </Providers>
        <OfflineBanner />
        <PortalHost />
        </ThemeProvider>
      </KeyboardProvider>
      </SafeAreaProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  )
}

export default Sentry.wrap(RootLayout)
