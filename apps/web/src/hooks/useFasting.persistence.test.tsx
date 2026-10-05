import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  user: 'owner', records: [] as Record<string, unknown>[],
  getFullList: vi.fn(), getList: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
}))
vi.mock('@calistenia/core/lib/pocketbase', () => ({ pb: {
  authStore: { get record() { return { id: h.user } } },
  filter: (_expression: string, args: unknown) => JSON.stringify(args),
  collection: () => ({ getFullList: h.getFullList, getList: h.getList, create: h.create, update: h.update, delete: h.delete }),
} }))
vi.mock('@calistenia/core/platform', () => ({
  storage: {
    getItem: (key: string) => localStorage.getItem(key),
    setItem: (key: string, value: string) => localStorage.setItem(key, value),
    removeItem: (key: string) => localStorage.removeItem(key),
  },
  lifecycle: { isForeground: () => true, onForeground: () => () => {} },
}))
vi.mock('@calistenia/core/lib/offlineQueue', () => ({ newClientId: () => 'unique-client-id' }))
import { useFasting } from '@calistenia/core/hooks/useFasting'
import { getFastingProgress } from '@calistenia/core/lib/fasting'

const clients: QueryClient[] = []
const start = '2026-10-01T18:00:42.000Z'
const row = { id: 'fast', user: 'owner', revision: 1, started_at: start, ended_at: '', goal_hours: 48, notes: '' }
function mount(user = 'owner') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  clients.push(client)
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(({ userId }) => useFasting(userId), { initialProps: { userId: user }, wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.user = 'owner'
  h.records = []
  h.getFullList.mockImplementation(async () => [...h.records])
  h.getList.mockResolvedValue({ items: [] })
  h.create.mockImplementation(async (data: Record<string, unknown>) => {
    const saved = { id: 'fast', revision: 1, ...data }
    h.records.push(saved)
    return saved
  })
  h.update.mockImplementation(async (id: string, data: Record<string, unknown>) => {
    const previous = h.records.find(r => r.id === id)!
    const next = { ...previous, ...data, revision: Number(previous.revision ?? 0) + 1 }
    h.records = h.records.map(r => r.id === id ? next : r)
    return next
  })
})
afterEach(() => { clients.forEach(c => c.clear()); clients.length = 0 })

describe('fasting persistence and recovery', () => {
  it('saves exact start/end instants and counts a multi-day session once', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => { await result.current.startFast({ startedAt: start, goalHours: 48 }) })
    await waitFor(() => expect(result.current.activeSession?.startedAt).toBe(start))
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ user: 'owner', started_at: start, ended_at: '', client_id: 'unique-client-id' }), { requestKey: null })
    const end = '2026-10-03T18:00:42.000Z'
    await act(async () => { await result.current.finishFast('fast', { endedAt: end }) })
    await waitFor(() => expect(result.current.activeSession).toBeNull())
    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.sessions[0].endedAt).toBe(end)
    expect(getFastingProgress(result.current.sessions[0]).elapsedMs).toBe(48 * 3600000)
  })

  it('recovers a 48-hour timer from durable cache after remount without a connection', async () => {
    h.records = [row]
    const first = mount()
    await waitFor(() => expect(first.result.current.activeSession?.id).toBe('fast'))
    first.unmount()
    h.getFullList.mockRejectedValue({ status: 0 })
    const second = mount()
    expect(second.result.current.activeSession?.startedAt).toBe(start)
    await waitFor(() => expect(second.result.current.error).toEqual({ status: 0 }))
    expect(getFastingProgress(second.result.current.activeSession!, Date.parse(start) + 48 * 3600000).goalReached).toBe(true)
    expect(second.result.current.activeSession?.endedAt).toBeNull()
  })

  it('failed finish preserves the active timer and last durable data', async () => {
    h.records = [row]
    const { result } = mount()
    await waitFor(() => expect(result.current.activeSession?.id).toBe('fast'))
    const cache = localStorage.getItem('calistenia_fasting_cache')
    h.update.mockRejectedValue({ status: 0 })
    await act(async () => { await expect(result.current.finishFast('fast')).rejects.toEqual({ status: 0 }) })
    expect(result.current.activeSession?.endedAt).toBeNull()
    expect(localStorage.getItem('calistenia_fasting_cache')).toBe(cache)
  })

  it('recovers a committed start after its response is lost and prevents a duplicate retry', async () => {
    h.create.mockImplementation(async (data: Record<string, unknown>) => {
      h.records = [{ id: 'fast', revision: 1, ...data }]
      throw { status: 0 }
    })
    const { result } = mount()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => { await expect(result.current.startFast({ startedAt: start, goalHours: 48 })).rejects.toEqual({ status: 0 }) })
    await waitFor(() => expect(result.current.activeSession?.id).toBe('fast'))
    await act(async () => { await expect(result.current.startFast({ startedAt: start, goalHours: 48 })).rejects.toThrow('alreadyActive') })
    expect(h.create).toHaveBeenCalledTimes(1)
    expect(result.current.sessions).toHaveLength(1)
  })

  it('recovers a committed finish after its response is lost and prevents reopening on retry', async () => {
    h.records = [row]
    h.update.mockImplementation(async (_id: string, data: Record<string, unknown>) => {
      h.records = [{ ...row, ...data, revision: 2 }]
      throw { status: 0 }
    })
    const { result } = mount()
    await waitFor(() => expect(result.current.activeSession?.id).toBe('fast'))
    const endedAt = '2026-10-03T18:00:42.000Z'
    await act(async () => { await expect(result.current.finishFast('fast', { endedAt })).rejects.toEqual({ status: 0 }) })
    await waitFor(() => expect(result.current.sessions[0].endedAt).toBe(endedAt))
    expect(result.current.activeSession).toBeNull()
    await act(async () => { await expect(result.current.finishFast('fast')).rejects.toThrow('alreadyEnded') })
    expect(h.update).toHaveBeenCalledTimes(1)
  })

  it('does not expose the previous account’s timer when switching users', async () => {
    h.records = [row]
    const { result, rerender } = mount()
    await waitFor(() => expect(result.current.activeSession?.id).toBe('fast'))
    h.user = 'other'
    h.records = []
    h.getFullList.mockRejectedValue({ status: 0 })
    rerender({ userId: 'other' })
    expect(result.current.activeSession).toBeNull()
    expect(result.current.sessions).toEqual([])
    await waitFor(() => expect(result.current.error).toEqual({ status: 0 }))
  })

  it('rejects mutations from a stale user binding before any request', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    h.user = 'other'
    await act(async () => { await expect(result.current.startFast()).rejects.toThrow('signIn') })
    expect(h.create).not.toHaveBeenCalled()
  })

  it('does not restore private storage when a pending save finishes after logout', async () => {
    let resolve!: (record: Record<string, unknown>) => void
    h.create.mockImplementation(() => new Promise<Record<string, unknown>>(r => { resolve = r }))
    const { result, unmount } = mount()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const pending = result.current.startFast({ startedAt: start, goalHours: 48 })
    await waitFor(() => expect(h.create).toHaveBeenCalled())
    unmount()
    h.user = 'other'
    localStorage.removeItem('calistenia_fasting_cache')
    await act(async () => { resolve(row); await pending })
    expect(localStorage.getItem('calistenia_fasting_cache')).toBeNull()
  })

  it('a pending save from the previous account cannot replace the current account cache', async () => {
    let resolve!: (record: Record<string, unknown>) => void
    h.create.mockImplementation(() => new Promise<Record<string, unknown>>(r => { resolve = r }))
    const { result, rerender } = mount()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    let pending!: Promise<unknown>
    act(() => { pending = result.current.startFast({ startedAt: start, goalHours: 48 }) })
    await waitFor(() => expect(h.create).toHaveBeenCalled())
    h.user = 'other'
    h.records = []
    rerender({ userId: 'other' })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const currentCache = localStorage.getItem('calistenia_fasting_cache')
    expect(JSON.parse(currentCache!).userId).toBe('other')
    await act(async () => { resolve(row); await pending })
    expect(result.current.activeSession).toBeNull()
    expect(localStorage.getItem('calistenia_fasting_cache')).toBe(currentCache)
  })

  it('rejects a stale editor revision after another device finishes the fast', async () => {
    h.records = [row]
    const { result } = mount()
    await waitFor(() => expect(result.current.activeSession?.revision).toBe(1))
    const old = result.current.activeSession!
    h.records = [{ ...row, revision: 2, ended_at: '2026-10-03T18:00:42.000Z', notes: 'Finished elsewhere' }]
    await act(async () => { await result.current.refresh() })
    await act(async () => { await expect(result.current.saveFast({ ...old, notes: 'Stale note' })).rejects.toThrow('conflict') })
    expect(h.update).not.toHaveBeenCalled()
    expect(result.current.activeSession).toBeNull()
    expect(result.current.sessions[0].notes).toBe('Finished elsewhere')
  })

  it('sends the captured revision to reject a race occurring after the last refresh', async () => {
    h.records = [row]
    const { result } = mount()
    await waitFor(() => expect(result.current.activeSession?.revision).toBe(1))
    const conflict = { status: 409, response: { data: { revision: { code: 'fasting_conflict' } } } }
    h.update.mockRejectedValue(conflict)
    await act(async () => { await expect(result.current.finishFast('fast', { revision: 1 })).rejects.toBe(conflict) })
    expect(h.update).toHaveBeenCalledWith('fast', expect.objectContaining({ expected_revision: 1 }), { requestKey: null })
    expect(result.current.activeSession?.endedAt).toBeNull()
  })

  it.each([
    { startedAt: 'bad' }, { goalHours: 0 }, { userId: 'other' }, { notes: null },
  ])('ignores damaged or foreign cached sessions rather than exposing an invalid timer (%j)', async change => {
    localStorage.setItem('calistenia_fasting_cache', JSON.stringify({ userId: 'owner', data: {
      settings: { goalHours: 16, weeklyGoal: 3 },
      sessions: [{ id: 'fast', userId: 'owner', startedAt: start, endedAt: null, goalHours: 48, notes: '', ...change }],
    } }))
    h.getFullList.mockRejectedValue({ status: 0 })
    const { result } = mount()
    expect(result.current.activeSession).toBeNull()
    await waitFor(() => expect(result.current.error).toEqual({ status: 0 }))
    expect(result.current.sessions).toEqual([])
  })

  it('recovers concurrent creation of the first settings row without creating duplicates', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    h.getList.mockResolvedValueOnce({ items: [] }).mockResolvedValue({ items: [{ id: 'settings', goal_hours: 24, weekly_goal: 3 }] })
    h.create.mockRejectedValue({ status: 400, response: { data: { user: { code: 'validation_not_unique' } } } })
    h.update.mockResolvedValue({ id: 'settings', goal_hours: 36, weekly_goal: 4 })
    await act(async () => { await result.current.saveSettings({ goalHours: 36, weeklyGoal: 4 }) })
    expect(h.create).toHaveBeenCalledTimes(1)
    expect(h.update).toHaveBeenCalledWith('settings', { goal_hours: 36, weekly_goal: 4 }, { requestKey: null })
  })

  it('a stale background read cannot overwrite a newly persisted session', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    let resolveRead!: (records: Record<string, unknown>[]) => void
    h.getFullList.mockImplementationOnce(() => new Promise<Record<string, unknown>[]>(r => { resolveRead = r }))
    let refreshing!: Promise<void>
    act(() => { refreshing = result.current.refresh() })
    await waitFor(() => expect(h.getFullList).toHaveBeenCalledTimes(2))
    await act(async () => { await result.current.startFast({ startedAt: start, goalHours: 48 }) })
    await waitFor(() => expect(result.current.activeSession?.id).toBe('fast'))
    await act(async () => { resolveRead([]); await refreshing })
    expect(result.current.activeSession?.id).toBe('fast')
    const cache = JSON.parse(localStorage.getItem('calistenia_fasting_cache')!)
    expect(cache.data.sessions).toHaveLength(1)
  })
})
