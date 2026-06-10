// init-core DEBE evaluarse antes que cualquier módulo de @calistenia/core.
import '@/lib/init-core'
import '../global.css'

import { useEffect, useState, type ReactNode } from 'react'
import { Stack, ThemeProvider } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { colorScheme as nwColorScheme, useColorScheme } from 'nativewind'
import { PortalHost } from '@rn-primitives/portal'
import { useRestPreferences } from '@calistenia/core/hooks/useRestPreferences'

import { pbAuthHydration } from '@/lib/init-core'
import { hydrateStorage } from '@/lib/storage'
import { initI18n } from '@/lib/i18n'
import { NAV_THEME } from '@/lib/theme'
import { useAuthUser } from '@/lib/use-auth-user'
import { WorkoutProvider } from '@/contexts/WorkoutContext'
import { ActiveSessionProvider } from '@/contexts/ActiveSessionContext'

SplashScreen.preventAutoHideAsync()
// darkMode: 'class' en tailwind.config → NativeWind controla la clase .dark;
// 'system' sigue el modo del dispositivo (igual que el default de la web).
nwColorScheme.set('system')

function Providers({ children }: { children: ReactNode }) {
  const user = useAuthUser()
  const { getRestForExercise, setRestForExercise } = useRestPreferences(user?.id ?? null)
  return (
    <WorkoutProvider userId={user?.id ?? null}>
      <ActiveSessionProvider getRestForExercise={getRestForExercise} setRestForExercise={setRestForExercise}>
        {children}
      </ActiveSessionProvider>
    </WorkoutProvider>
  )
}

export default function RootLayout() {
  const { colorScheme } = useColorScheme()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      // Sesión PB persistida + caché síncrona de storage, antes de pintar nada.
      await Promise.all([hydrateStorage(), pbAuthHydration])
      initI18n()
      if (!cancelled) setReady(true)
      SplashScreen.hideAsync()
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) return null

  return (
    <ThemeProvider value={NAV_THEME[colorScheme === 'dark' ? 'dark' : 'light']}>
      <StatusBar style="auto" />
      <Providers>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="session" options={{ gestureEnabled: false }} />
        </Stack>
      </Providers>
      <PortalHost />
    </ThemeProvider>
  )
}
