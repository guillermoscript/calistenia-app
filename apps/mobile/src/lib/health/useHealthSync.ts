/**
 * useHealthSync — React state around the Health Connect bridge + sync.
 *
 * Exposes hub status, connection state, today's cached summary, last-sync
 * time, and connect/sync actions. Android-only in Fase 1; on iOS/web the
 * bridge reports 'unsupported' and the screen renders a graceful prompt.
 */
import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { storage } from '@calistenia/core/platform'
import { qk } from '@calistenia/core/lib/query-keys'
import type { HealthHubStatus } from '@calistenia/core/types'
import { useAuthUser } from '@/lib/use-auth-user'
import * as hc from './bridge'
import { readDailyCache, syncHealth } from './sync'

const LAST_SYNC_KEY = 'calistenia_health_last_sync'
/** No re-sincronizar más seguido que esto en auto (el botón manual lo ignora). */
const AUTO_SYNC_THROTTLE_MS = 2 * 60_000
const getLastSync = (): string | null => {
  try {
    return storage.getItem(LAST_SYNC_KEY) || null
  } catch {
    return null
  }
}
const setLastSync = (v: string): void => {
  try {
    storage.setItem(LAST_SYNC_KEY, v)
  } catch {
    /* storage lleno */
  }
}

function todayLocal(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function useHealthSync() {
  const qc = useQueryClient()
  const user = useAuthUser()
  const userId = user?.id ?? null
  const lastAutoSync = useRef(0)

  const statusQuery = useQuery({
    queryKey: qk.health.status(userId),
    queryFn: async () => {
      const status = await hc.getStatus()
      const connected = status === 'available' ? await hc.isConnected() : false
      return { status, connected }
    },
    staleTime: 30_000,
  })

  const today = todayLocal()
  const summaryQuery = useQuery({
    queryKey: qk.health.daily(userId, today),
    queryFn: () => readDailyCache(userId!, today),
    enabled: !!userId,
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('sin sesión')
      const res = await syncHealth({ userId })
      if (!res.ok) throw new Error(res.error || 'sync falló')
      setLastSync(res.syncedAt)
      return res
    },
    onSuccess: () => {
      lastAutoSync.current = Date.now()
      qc.invalidateQueries({ queryKey: qk.health.all })
    },
  })

  const connectMutation = useMutation({
    mutationFn: async () => {
      const granted = await hc.requestPermissions()
      return granted.length > 0
    },
    onSuccess: (ok) => {
      qc.invalidateQueries({ queryKey: qk.health.status(userId) })
      if (ok) syncMutation.mutate()
    },
  })

  // ─── Auto-sync ──────────────────────────────────────────────────────────────
  // Re-lee Health Connect sin que el usuario toque el botón: al confirmarse la
  // conexión (montar la pantalla) y cada vez que la app vuelve a primer plano
  // (el reloj suele subir a HC con la app en background). Throttled para no
  // re-leer 14 días en cada foco; el botón manual sigue ignorando el throttle.
  const connected = statusQuery.data?.connected ?? false
  const syncPending = syncMutation.isPending
  const runSync = syncMutation.mutate

  const maybeAutoSync = useCallback(() => {
    if (!connected || syncPending) return
    const now = Date.now()
    if (now - lastAutoSync.current < AUTO_SYNC_THROTTLE_MS) return
    lastAutoSync.current = now
    runSync()
  }, [connected, syncPending, runSync])

  useEffect(() => {
    maybeAutoSync()
  }, [maybeAutoSync])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') maybeAutoSync()
    })
    return () => sub.remove()
  }, [maybeAutoSync])

  return {
    userId,
    status: (statusQuery.data?.status ?? 'unsupported') as HealthHubStatus,
    isConnected: statusQuery.data?.connected ?? false,
    isLoadingStatus: statusQuery.isLoading,
    summary: summaryQuery.data ?? null,
    lastSyncedAt: getLastSync(),
    connect: connectMutation.mutate,
    isConnecting: connectMutation.isPending,
    sync: syncMutation.mutate,
    isSyncing: syncMutation.isPending,
    syncError: syncMutation.error as Error | null,
    openSettings: hc.openSettings,
    refetchStatus: statusQuery.refetch,
  }
}
