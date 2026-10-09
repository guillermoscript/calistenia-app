/**
 * Hub de la sesión de cardio nativa. La máquina de estados, la copia de
 * seguridad, la cola de reintento y el CRUD de PocketBase viven en core
 * (`useCardioSessionState`, compartido con la web); aquí sólo se inyecta lo
 * nativo:
 *  - navigator.geolocation → cardio-tracker (expo-location + FGS)
 *  - wake lock → expo-keep-awake
 *  - háptica, notificación en vivo del FGS y widget de la pantalla de inicio
 */
import { createContext, use, useCallback, useEffect, useRef, type ReactNode } from 'react'
import i18n from 'i18next'
import {
  useCardioSessionState,
  type CardioSessionEvents, type CardioSessionStateValue,
  type SessionState as CoreSessionState,
} from '@calistenia/core/hooks/session-contexts/useCardioSessionState'

import { haptics } from '@/lib/haptics'
import {
  startCardioLive, updateCardioLive, pauseCardioLive, resumeCardioLive,
  endCardioLive, setCardioLiveActionHandler,
} from '@/lib/cardio-live'
import { syncCardioWidget } from '@/lib/sync-cardio-widget'
import { useKeepAwakeWhile } from '@/hooks/useKeepAwakeWhile'
import { useCardioTracking } from '@/hooks/cardio/useCardioTracking'

const KEEP_AWAKE_TAG = 'cardio-session'

// ── Types ────────────────────────────────────────────────────────────────────

export type SessionState = CoreSessionState

type CardioSessionContextValue = CardioSessionStateValue

const CardioSessionContext = createContext<CardioSessionContextValue | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

interface Props {
  userId: string | null
  userWeight?: number
  children: ReactNode
}

// Módulo-nivel: core los llama como hooks, tienen que ser siempre los mismos.
const useCardioKeepAwake = (active: boolean) => useKeepAwakeWhile(active, KEEP_AWAKE_TAG)
const geoUnavailableMessage = () => i18n.t('cardioSession.geoNotAvailable')

const nativeEvents: CardioSessionEvents = {
  // Km completado — vibración estilo Strava (el teléfono suele ir en el bolsillo
  // o el brazalete: la háptica es el único feedback que llega) y notificación
  // en vivo (el throttle vive dentro del módulo).
  onFixAccepted: (accepted) => {
    if (accepted.splitCompleted) void haptics.success()
    updateCardioLive({
      distanceKm: accepted.distanceKm,
      paceMinKm: accepted.paceMinKm,
      speedKmh: accepted.speedKmh,
    })
  },
  onPermissionDenied: () => { void haptics.error() },
  // El FGS (notificación) debe arrancar con la app en foreground y el permiso
  // ya concedido — es lo que mantiene el GPS vivo con la pantalla bloqueada.
  onStarting: async (type, startTime) => {
    void haptics.medium()
    await startCardioLive(type, startTime)
  },
  // En el contexto y no en el botón, para que también vibre al pausar desde la
  // notificación con el teléfono bloqueado.
  onPaused: () => {
    void haptics.medium()
    void pauseCardioLive()
  },
  onResumed: (liveStartTime) => {
    void haptics.medium()
    void resumeCardioLive(liveStartTime)
  },
  onFinishing: () => {
    void endCardioLive()
    void haptics.success()
  },
  onSaved: (userId) => { void syncCardioWidget(userId) },
  onSaveQueued: () => { void haptics.warning() },
  onQueueFlushed: (userId) => { void syncCardioWidget(userId) },
  onDiscarded: () => { void endCardioLive() },
  onRestoredTracking: (type, liveStartTime) => { void startCardioLive(type, liveStartTime) },
  onTeardown: () => { void endCardioLive() },
}

export function CardioSessionProvider({ userId, userWeight, children }: Props) {
  const value = useCardioSessionState({
    userId,
    userWeight,
    useTracking: useCardioTracking,
    useKeepAwake: useCardioKeepAwake,
    geoUnavailableMessage,
    events: nativeEvents,
  })

  useEffect(() => { void syncCardioWidget(userId) }, [userId])

  // Botones de la notificación → pausar/reanudar la sesión.
  const pauseRef = useRef(value.pause)
  const resumeRef = useRef(value.resume)
  pauseRef.current = value.pause
  resumeRef.current = value.resume
  const onLiveAction = useCallback((action: 'pause' | 'resume') => {
    if (action === 'pause') pauseRef.current()
    else resumeRef.current()
  }, [])
  useEffect(() => {
    setCardioLiveActionHandler(onLiveAction)
    return () => setCardioLiveActionHandler(null)
  }, [onLiveAction])

  return (
    <CardioSessionContext.Provider value={value}>
      {children}
    </CardioSessionContext.Provider>
  )
}

export function useCardioSessionContext() {
  const ctx = use(CardioSessionContext)
  if (!ctx) throw new Error('useCardioSessionContext must be used within CardioSessionProvider')
  return ctx
}
