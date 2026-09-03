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
import { PortalHost } from '@rn-primitives/portal'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createQueryClient, createCorePersister, setupOnlineManager, PERSIST_MAX_AGE, PERSIST_BUSTER } from '@calistenia/core/lib/query-client'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import { useRestPreferences } from '@calistenia/core/hooks/useRestPreferences'
import { useWeight } from '@calistenia/core/hooks/useWeight'
import { pb, tryRefreshAuth, verifyAuth } from '@calistenia/core/lib/pocketbase'
import { setupAutoSync } from '@calistenia/core/lib/offlineQueue'
import { consumeBattleInviteToken } from '@calistenia/core/lib/battleInviteHandoff'

import { Sentry } from '@/lib/instrument'
import { FONTS } from '@/lib/fonts'
import { resolveNotifUrl } from '@/lib/notification-route'
import { screenPattern } from '@/lib/screen-pattern'
import { cancelLegacyLocalReminders } from '@/lib/reminder-scheduler'
import { pbAuthHydration, trackScreen } from '@/lib/init-core'
import { hydrateStorage } from '@/lib/storage'
import { applyThemeMode, getThemeMode } from '@/lib/theme-mode'
import { initI18n } from '@/lib/i18n'
import { verifyStylesRegistered } from '@/lib/style-selfcheck'
import { NAV_THEME } from '@/lib/theme'
import { useAuthUser } from '@/lib/use-auth-user'
import { WorkoutProvider } from '@/contexts/WorkoutContext'
import { ActiveSessionProvider } from '@/contexts/ActiveSessionContext'
import { CardioSessionProvider } from '@/contexts/CardioSessionContext'
import { CircuitSessionProvider, useCircuitSession } from '@/contexts/CircuitSessionContext'
import OfflineBanner from '@/components/OfflineBanner'
import UpdateGate from '@/components/UpdateGate'

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
          <CircuitSessionProvider userId={user?.id ?? null}>{children}</CircuitSessionProvider>
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

/**
 * Recupera una invitación a batalla que quedó pendiente antes del registro (#356).
 *
 * El amigo desconectado que toca el enlace pasa por instalar la app y crear cuenta; el
 * token se guardó en `battle-invite/[token]` y aquí, ya con sesión, se consume una sola
 * vez y se le lleva al aterrizaje autenticado para que vea a qué entra y confirme.
 * Nunca se une solo: unirse es una decisión suya.
 */
function BattleInviteRedeemer() {
  const router = useRouter()
  const user = useAuthUser()
  const redeemed = useRef(false)

  // Depende del usuario, no solo del montaje: el registro ocurre con este layout ya
  // montado, así que el disparo útil es la transición a sesión válida.
  useEffect(() => {
    if (redeemed.current || !user?.id) return
    const token = consumeBattleInviteToken()
    if (!token) return
    redeemed.current = true
    router.push(`/battle-invite/${token}`)
  }, [router, user?.id])

  return null
}

function RootLayout() {
  const { colorScheme } = useColorScheme()
  const [ready, setReady] = useState(false)
  // fontError: seguir sin fuentes custom antes que quedarse en blanco
  const [fontsLoaded, fontError] = useFonts(FONTS)

  // OpenPanel screen views (la web los auto-trackea; en RN es manual).
  //
  // El NOMBRE de la pantalla es el patrón de ruta (`/challenges/[id]`), no la
  // ruta resuelta: mandando `pathname` cada reto, cada batalla y cada carrera
  // creaba su propia pantalla en OpenPanel, así que el informe de vistas era
  // una lista infinita de ids sin ninguna fila agregada por pantalla (#636).
  // La ruta concreta sigue viajando como propiedad, que es donde no molesta.
  const pathname = usePathname()
  const segments = useSegments()
  useEffect(() => {
    trackScreen(screenPattern(segments), { path: pathname, platform: 'mobile' })
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
    // El tap de una push nativa no se medía (#636 §5). Es el evento más caro de
    // los que faltaban: los recordatorios push son la palanca de retención
    // principal y su efecto era literalmente invisible. `source` separa los dos
    // caminos porque miden cosas distintas: abrir la app desde la notificación
    // no es lo mismo que tocarla con la app ya abierta.
    const trackTap = (response: Notifications.NotificationResponse, source: string) => {
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.notificationClicked, {
        surface: 'notification',
        source,
        url: response.notification.request.content.data?.url as string | undefined,
        title: response.notification.request.content.title ?? undefined,
        // Qué campaña de push disparó el tap (recordatorio, inactividad 24h/72h…),
        // el dato que faltaba para saber CUÁL push trae de vuelta al usuario (#695).
        campaign: response.notification.request.content.data?.campaign as string | undefined,
      })
    }

    // COLD START: if the app was opened by tapping a notification, handle it once.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return
      trackTap(response, 'cold_start')
      const url = response.notification.request.content.data?.url as string | undefined
      const route = resolveNotifUrl(url)
      if (route) routerRef.current.push(route as Parameters<typeof routerRef.current.push>[0])
    }).catch(() => { /* ignore */ })

    // FOREGROUND / BACKGROUND TAP: listener for subsequent taps.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      trackTap(response, 'tap')
      const url = response.notification.request.content.data?.url as string | undefined
      const route = resolveNotifUrl(url)
      if (route) routerRef.current.push(route as Parameters<typeof routerRef.current.push>[0])
    })

    return () => sub.remove()
  }, [])  // intentionally empty — runs once on mount

  // ── Recordatorios: limpiar la programación local antigua ──────────────────
  // Los recordatorios ahora llegan por push del servidor. Quien actualice desde
  // una versión anterior tiene notificaciones WEEKLY locales ya programadas;
  // si no se cancelan, cada recordatorio sonaría dos veces.
  useEffect(() => {
    cancelLegacyLocalReminders()
  }, [])

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
      // El CSS de NativeWind se inyecta al importar '../global.css' (arriba del
      // todo). Si no llegó al registro, la app sale sin un solo estilo y sin
      // lanzar nada: esto lo convierte en un evento de Sentry (ver #1.7.0).
      verifyStylesRegistered()
      readyRef.current = true
      if (!cancelled) setReady(true)
    }
    // El boot NUNCA puede dejar el splash colgado (#661): si algo de aquí
    // rechaza, `setReady(true)` no se llamaba nunca, `SplashScreen.hideAsync()`
    // tampoco y la app se quedaba en negro para siempre. Pasó con una clave de
    // AsyncStorage de más de 2 MB (CursorWindow de Android). Arrancar en
    // degradado —sin caché, sin tema guardado— siempre es mejor que no arrancar.
    boot().catch((e) => {
      console.error('[boot] falló, se arranca en degradado:', e)
      Sentry.captureException(e, { tags: { boot_stage: 'bootstrap' } })
      // readyRef también: es lo que habilita el kick a /login cuando el
      // authStore se limpia en caliente. Sin él la app quedaría sin esa salida.
      readyRef.current = true
      if (!cancelled) setReady(true)
    })
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
        persistOptions={{ persister, maxAge: PERSIST_MAX_AGE, buster: PERSIST_BUSTER }}
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
          <BattleInviteRedeemer />
        </Providers>
        <OfflineBanner />
        {/* Fuera de <Providers> a propósito: el gate tiene que poder bloquear
            aunque los contexts de sesión fallen, y no depende de ninguno. */}
        <UpdateGate />
        <PortalHost />
        </ThemeProvider>
      </KeyboardProvider>
      </SafeAreaProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  )
}

export default Sentry.wrap(RootLayout)
