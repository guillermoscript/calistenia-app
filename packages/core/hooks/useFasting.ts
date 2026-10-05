import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { lifecycle, storage } from '../platform'
import { newClientId } from '../lib/offlineQueue'
import {
  DEFAULT_FASTING_SETTINGS, FastingError, normalizeFastingTimestamp,
  validateFastingSession, validateFastingSettings,
  type FastingSession, type FastingSessionInput, type FastingSettings,
} from '../lib/fasting'

const CACHE_KEY = 'calistenia_fasting_cache'
export interface FastingData { sessions: FastingSession[]; settings: FastingSettings }
export interface UseFastingReturn extends FastingData {
  activeSession: FastingSession | null
  isLoading: boolean
  isSaving: boolean
  error: unknown
  refresh: () => Promise<void>
  saveSettings: (settings: Pick<FastingSettings, 'goalHours' | 'weeklyGoal'>) => Promise<void>
  startFast: (input?: { startedAt?: string; goalHours?: number; notes?: string }) => Promise<FastingSession>
  finishFast: (id: string, input?: { endedAt?: string; notes?: string }) => Promise<FastingSession>
  saveFast: (input: FastingSessionInput) => Promise<FastingSession>
  deleteFast: (id: string) => Promise<void>
}

export function mapFastingSession(record: Record<string, unknown>): FastingSession {
  return {
    id: String(record.id), userId: String(record.user),
    startedAt: normalizeFastingTimestamp(String(record.started_at)),
    endedAt: record.ended_at ? normalizeFastingTimestamp(String(record.ended_at)) : null,
    goalHours: Number(record.goal_hours), notes: String(record.notes ?? ''),
  }
}

function readCache(userId: string | null): FastingData | undefined {
  if (!userId) return undefined
  try {
    const cached = JSON.parse(storage.getItem(CACHE_KEY) || 'null')
    if (cached?.userId !== userId || !Array.isArray(cached?.data?.sessions)) return undefined
    validateFastingSettings(cached.data.settings)
    return cached.data
  } catch { return undefined }
}

function writeCache(userId: string, data: FastingData): void {
  try { storage.setItem(CACHE_KEY, JSON.stringify({ userId, data })) } catch { /* Query cache remains usable if storage is full. */ }
}

export async function fetchFastingData(userId: string, signal?: AbortSignal): Promise<FastingData> {
  const filter = pb.filter('user = {:user}', { user: userId })
  const [sessions, settings] = await Promise.all([
    pb.collection('fasting_sessions').getFullList({ filter, sort: '-started_at', requestKey: null, ...(signal ? { signal } : {}) }),
    pb.collection('fasting_settings').getList(1, 1, { filter, requestKey: null, ...(signal ? { signal } : {}) }),
  ])
  const record = settings.items[0]
  return {
    sessions: sessions.map(mapFastingSession),
    settings: record ? { id: record.id, goalHours: Number(record.goal_hours), weeklyGoal: Number(record.weekly_goal) } : { ...DEFAULT_FASTING_SETTINGS },
  }
}

type FastingAction =
  | { type: 'save'; input: FastingSessionInput; clientId: string }
  | { type: 'delete'; id: string }
  | { type: 'settings'; settings: Pick<FastingSettings, 'goalHours' | 'weeklyGoal'> }

/** Online writes are acknowledged by the server; timestamps/cache keep the timer usable offline. */
export function useFasting(userId: string | null): UseFastingReturn {
  const qc = useQueryClient()
  const key = qk.fasting.data(userId)
  const currentUser = useRef(userId)
  const mounted = useRef(true)
  useEffect(() => {
    currentUser.current = userId
    mounted.current = true
    return () => { mounted.current = false }
  }, [userId])
  const canPersist = () => mounted.current && currentUser.current === userId && pb.authStore.record?.id === userId
  const query = useQuery<FastingData>({
    queryKey: key,
    enabled: !!userId,
    initialData: () => readCache(userId),
    initialDataUpdatedAt: 0,
    staleTime: 15_000,
    // A LAN backend can still be reachable when the device reports no Internet.
    // Failed requests retain cached sessions; only server responses confirm writes.
    networkMode: 'always',
    refetchInterval: () => lifecycle.isForeground() ? 30_000 : false,
    queryFn: async ({ signal }) => {
      const data = await fetchFastingData(userId!, signal)
      if (!signal.aborted && canPersist()) writeCache(userId!, data)
      return data
    },
  })
  useEffect(() => lifecycle.onForeground(() => {
    if (userId) void qc.invalidateQueries({ queryKey: qk.fasting.data(userId) })
  }), [qc, userId])

  const mutation = useMutation<FastingSession | void, unknown, FastingAction>({
    mutationKey: ['fasting-write', userId],
    scope: { id: `fasting-${userId}` },
    networkMode: 'always',
    retry: false,
    mutationFn: async action => {
      if (!userId || pb.authStore.record?.id !== userId) throw new FastingError('signIn')
      await qc.cancelQueries({ queryKey: key })
      if (action.type === 'settings') {
        validateFastingSettings(action.settings)
        const found = await pb.collection('fasting_settings').getList(1, 1, {
          filter: pb.filter('user = {:user}', { user: userId }), requestKey: null,
        })
        const payload = { goal_hours: action.settings.goalHours, weekly_goal: action.settings.weeklyGoal }
        const existing = found.items[0]
        const record = existing
          ? await pb.collection('fasting_settings').update(existing.id, payload, { requestKey: null })
          : await pb.collection('fasting_settings').create({ ...payload, user: userId }, { requestKey: null })
        const data = qc.getQueryData<FastingData>(key) ?? { sessions: [], settings: DEFAULT_FASTING_SETTINGS }
        const next = { ...data, settings: { id: record.id, goalHours: Number(record.goal_hours), weeklyGoal: Number(record.weekly_goal) } }
        // Cancel a poll that could have started while the write was in flight.
        await qc.cancelQueries({ queryKey: key })
        if (canPersist()) { qc.setQueryData(key, next); writeCache(userId, next) }
        return
      }
      const data = qc.getQueryData<FastingData>(key) ?? readCache(userId)
      if (!data) throw new FastingError('load')
      let next: FastingData
      let saved: FastingSession | undefined
      if (action.type === 'delete') {
        await pb.collection('fasting_sessions').delete(action.id, { requestKey: null })
        next = { ...data, sessions: data.sessions.filter(s => s.id !== action.id) }
      } else {
        validateFastingSession(action.input, data.sessions)
        const payload = {
          started_at: normalizeFastingTimestamp(action.input.startedAt),
          ended_at: action.input.endedAt ? normalizeFastingTimestamp(action.input.endedAt) : '',
          goal_hours: action.input.goalHours, notes: action.input.notes?.trim() ?? '',
        }
        const record = action.input.id
          ? await pb.collection('fasting_sessions').update(action.input.id, payload, { requestKey: null })
          : await pb.collection('fasting_sessions').create({ ...payload, user: userId, client_id: action.clientId }, { requestKey: null })
        saved = mapFastingSession(record)
        next = { ...data, sessions: [saved, ...data.sessions.filter(s => s.id !== saved!.id)].sort((a, b) => b.startedAt.localeCompare(a.startedAt)) }
      }
      await qc.cancelQueries({ queryKey: key })
      if (canPersist()) { qc.setQueryData(key, next); writeCache(userId, next) }
      return saved
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: key }) },
  })

  const data = query.data ?? { sessions: [], settings: { ...DEFAULT_FASTING_SETTINGS } }
  const saveFast = async (input: FastingSessionInput): Promise<FastingSession> => {
    return await mutation.mutateAsync({ type: 'save', input, clientId: newClientId() }) as FastingSession
  }
  return {
    ...data,
    activeSession: data.sessions.find(s => s.endedAt === null) ?? null,
    isLoading: !!userId && query.isPending && query.fetchStatus !== 'paused',
    isSaving: mutation.isPending,
    error: query.error ?? (!query.data && query.fetchStatus === 'paused' ? new FastingError('offline') : null),
    refresh: async () => { const result = await query.refetch(); if (result.error) throw result.error },
    saveSettings: async settings => { await mutation.mutateAsync({ type: 'settings', settings }) },
    startFast: async (input = {}) => saveFast({
      startedAt: input.startedAt ?? new Date().toISOString(), endedAt: null,
      goalHours: input.goalHours ?? data.settings.goalHours, notes: input.notes,
    }),
    finishFast: async (id, input = {}) => {
      const session = data.sessions.find(s => s.id === id)
      if (!session) throw new FastingError('load')
      if (session.endedAt !== null) throw new FastingError('alreadyEnded')
      return saveFast({ ...session, endedAt: input.endedAt ?? new Date().toISOString(), notes: input.notes ?? session.notes })
    },
    saveFast,
    deleteFast: async id => { await mutation.mutateAsync({ type: 'delete', id }) },
  }
}
