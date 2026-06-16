// init-core DEBE evaluarse antes que cualquier módulo de @calistenia/core.
import '@/lib/init-core'
import '../global.css'
// Registra setNotificationHandler app-wide (rest timer + recordatorios) al boot.
import '@/lib/notifications'

import { useEffect, useState, type ReactNode } from 'react'
import { Platform } from 'react-native'
import { Stack, ThemeProvider, usePathname, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { colorScheme as nwColorScheme, useColorScheme } from 'nativewind'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { PortalHost } from '@rn-primitives/portal'
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
            {/* Session slides up like a modal — can't gesture-dismiss mid-workout */}
            <Stack.Screen name="session" options={{ gestureEnabled: false, animation: 'slide_from_bottom' }} />
          </Stack>
        </Providers>
        <OfflineBanner />
        <PortalHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  )
}

export default Sentry.wrap(RootLayout)
