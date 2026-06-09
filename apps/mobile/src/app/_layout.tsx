// init-core DEBE evaluarse antes que cualquier módulo de @calistenia/core.
import '@/lib/init-core'
import '../global.css'

import { useEffect, useState } from 'react'
import { Stack, ThemeProvider } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { colorScheme as nwColorScheme, useColorScheme } from 'nativewind'
import { PortalHost } from '@rn-primitives/portal'

import { pbAuthHydration } from '@/lib/init-core'
import { hydrateStorage } from '@/lib/storage'
import { initI18n } from '@/lib/i18n'
import { NAV_THEME } from '@/lib/theme'

SplashScreen.preventAutoHideAsync()
// darkMode: 'class' en tailwind.config → NativeWind controla la clase .dark;
// 'system' sigue el modo del dispositivo (igual que el default de la web).
nwColorScheme.set('system')

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
      <Stack screenOptions={{ headerShown: false }} />
      <PortalHost />
    </ThemeProvider>
  )
}
