// init-core DEBE evaluarse antes que cualquier módulo de @calistenia/core.
import '@/lib/init-core'
import '../global.css'

import { useEffect, useState, type ReactNode } from 'react'
import { Stack, ThemeProvider } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { colorScheme as nwColorScheme, useColorScheme } from 'nativewind'
import { PortalHost } from '@rn-primitives/portal'
import { useRestPreferences } from '@calistenia/core/hooks/useRestPreferences'
import { useWeight } from '@calistenia/core/hooks/useWeight'
import { pb } from '@calistenia/core/lib/pocketbase'
import { setupAutoSync } from '@calistenia/core/lib/offlineQueue'

import { Sentry } from '@/lib/instrument'
import { FONTS } from '@/lib/fonts'
import { pbAuthHydration } from '@/lib/init-core'
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
          {children}
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

  // Reintenta acciones encoladas offline al recuperar conexión (igual que web).
  useEffect(() => setupAutoSync(pb), [])

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
    <ThemeProvider value={NAV_THEME[colorScheme === 'dark' ? 'dark' : 'light']}>
      <StatusBar style="auto" />
      <Providers>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="session" options={{ gestureEnabled: false }} />
        </Stack>
      </Providers>
      <OfflineBanner />
      <PortalHost />
    </ThemeProvider>
  )
}

export default Sentry.wrap(RootLayout)
