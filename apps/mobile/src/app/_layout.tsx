// init-core DEBE evaluarse antes que cualquier módulo de @calistenia/core.
import '@/lib/init-core'
import '../global.css'
// Registra setNotificationHandler app-wide (rest timer + recordatorios) al boot.
import '@/lib/notifications'

import { useEffect, useState, useRef, type ReactNode } from 'react'
import { AppState, Platform } from 'react-native'
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
import { pb, tryRefreshAuth, verifyAuth } from '@calistenia/core/lib/pocketbase'
import { setupAutoSync } from '@calistenia/core/lib/offlineQueue'

import { Sentry } from '@/lib/instrument'
import { FONTS } from '@/lib/fonts'
import { resolveNotifUrl } from '@/lib/notification-route'
import { pbAuthHydration, trackScreen } from '@/lib/init-core'
import { hydrateStorage } from '@/lib/storage'
import { applyThemeMode, getThemeMode } from '@/lib/theme-mode'
import { initI18n } from '@/lib/i18n'
import { NAV_THEME } from '@/lib/theme'
import { useAuthUser } from '@/lib/use-auth-user'
import { WorkoutProvider } from '@/contexts/WorkoutContext'
import { ActiveSessionProvider } from '@/contexts/ActiveSessionContext'
import { CardioSessionProvider } from '@/contexts/CardioSessionContext'
import { CircuitSessionProvider, useCircuitSession } from '@/contexts/CircuitSessionContext'
import OfflineBanner from '@/components/OfflineBanner'

SplashScreen.preventAutoHideAsync()

// Deep-link de notificaciones: `resolveNotifUrl` (mapea la url del payload de push
// a una ruta nativa) vive en '@/lib/notification-route', compartido con la campana.

// Singletons a nivel módulo: un único QueryClient/persister por vida de la app.
// init-core ya corrió (primer import del archivo), así que el adapter está listo.
setupOnlineManager()
const queryClient = createQueryClient()
const persister = createCorePersister()
// darkMode: 'class' en tailwind.config → NativeWind controla la clase .dark;
// 'system' como default inicial; la preferencia persistida se aplica en boot
// (applyThemeMode) tras hidratar storage, mientras el splash sigue visible.
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
          <CircuitSessionProvider userId={user?.id ?? null}>
            <BottomSheetModalProvider>{children}</BottomSheetModalProvider>
          </CircuitSessionProvider>
        </CardioSessionProvider>
      </ActiveSessionProvider>
    </WorkoutProvider>
  )
}

/** Si al arrancar la app hay un circuito persistido (restaurado del storage),
 *  reabre el runner una sola vez — paridad con CircuitRestoreNavigator de la web. */
function CircuitRestoreNavigator() {
  const { isActive } = useCircuitSession()
  const router = useRouter()
  // Solo true si había un circuito activo en el primer render (restaurado al boot),
  // no para los que se inician durante esta sesión (esos ya navegan ellos mismos).
  const restoredOnBoot = useRef(isActive)
  const hasNavigated = useRef(false)

  useEffect(() => {
    if (restoredOnBoot.current && !hasNavigated.current) {
      hasNavigated.current = true
      router.push('/circuit')
    }
  }, [router])

  return null
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
      const route = resolveNotifUrl(url)
      if (route) routerRef.current.push(route as Parameters<typeof routerRef.current.push>[0])
    }).catch(() => { /* ignore */ })

    // FOREGROUND / BACKGROUND TAP: listener for subsequent taps.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url as string | undefined
      const route = resolveNotifUrl(url)
      if (route) routerRef.current.push(route as Parameters<typeof routerRef.current.push>[0])
    })

    return () => sub.remove()
  }, [])  // intentionally empty — runs once on mount

  // ── Sesión fantasma (#254): expulsión en caliente + revalidación ──────────
  const readyRef = useRef(false)
  useEffect(() => {
    // Si el authStore pasa de logueado a vacío con la app abierta (token
    // rechazado por el server, logout), volver a login desde cualquier ruta.
    // Solo tras el boot: durante el arranque el guard de (tabs) ya redirige.
    let hadUser = pb.authStore.isValid
    const unsubAuth = pb.authStore.onChange(() => {
      const hasUser = pb.authStore.isValid
      if (readyRef.current && hadUser && !hasUser) routerRef.current.replace('/login')
      hadUser = hasUser
    })
    // Al volver a foreground, re-comprobar el token con el server (verifyAuth
    // deduplica y respeta un intervalo mínimo, no spamea).
    const subAppState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void verifyAuth().catch(() => {})
    })
    return () => {
      unsubAuth()
      subAppState.remove()
    }
  }, [])  // intentionally empty — runs once on mount

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      // Sesión PB persistida + caché síncrona de storage, antes de pintar nada.
      await Promise.all([hydrateStorage(), pbAuthHydration])
      // Validar el token persistido contra el server (#254): isValid solo mira
      // la expiración local, así que un token invalidado (cambio de contraseña
      // en otro dispositivo, rotación de tokenKey) pasaba el guard y la app
      // navegaba como invitado (listas vacías, creates 400). Cap de 2.5s para
      // no colgar el splash sin red; si el refresh resuelve más tarde y limpia
      // el authStore, el kick en caliente (effect de abajo) expulsa a login.
      await Promise.race([
        tryRefreshAuth().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ])
      // Storage ya hidratado → aplica la preferencia de tema guardada (claro/oscuro/sistema).
      applyThemeMode(getThemeMode())
      initI18n()
      readyRef.current = true
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
            {/* Circuit runner slides up like the session — full-screen, no gesture dismiss */}
            <Stack.Screen name="circuit" options={{ gestureEnabled: false, animation: 'slide_from_bottom' }} />
          </Stack>
          <CircuitRestoreNavigator />
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
