import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pb } from '../lib/pocketbase'
import { fetchFastingData, mapFastingSession } from './useFasting'

const { getFullList, getList } = vi.hoisted(() => ({ getFullList: vi.fn(), getList: vi.fn() }))
vi.mock('../lib/pocketbase', () => ({
  pb: {
    filter: vi.fn(() => 'owner-filter'),
    collection: vi.fn((name: string) => name === 'fasting_sessions' ? { getFullList } : { getList }),
  },
}))

beforeEach(() => vi.clearAllMocks())

const record = {
  id: 'session-1', user: 'owner-1', started_at: '2026-10-01 20:00:00.000Z',
  ended_at: '', goal_hours: 48, notes: '',
}

describe('PocketBase fasting record mapping', () => {
  it('maps empty end to active and canonicalizes PocketBase UTC dates', () => {
    expect(mapFastingSession(record)).toEqual({
      id: 'session-1', userId: 'owner-1', startedAt: '2026-10-01T20:00:00.000Z',
      endedAt: null, goalHours: 48, notes: '',
    })
  })

  it('preserves completed end, decimal goal and recorded notes', () => {
    expect(mapFastingSession({ ...record, ended_at: '2026-10-03 20:00:00.000Z', goal_hours: 36.5, notes: 'Ended after dinner' })).toMatchObject({
      endedAt: '2026-10-03T20:00:00.000Z', goalHours: 36.5, notes: 'Ended after dinner',
    })
  })

  it('rejects corrupted start/end timestamps instead of showing an invalid timer', () => {
    expect(() => mapFastingSession({ ...record, started_at: 'bad' })).toThrow('invalidDate')
    expect(() => mapFastingSession({ ...record, ended_at: 'bad' })).toThrow('invalidDate')
  })
})

describe('fetchFastingData', () => {
  it('loads all history scoped to the current owner and its settings', async () => {
    getFullList.mockResolvedValue([record, { ...record, id: 'older', started_at: '2026-09-01 20:00:00.000Z', ended_at: '2026-09-02 20:00:00.000Z' }])
    getList.mockResolvedValue({ items: [{ id: 'settings-1', goal_hours: 36, weekly_goal: 2 }] })
    const data = await fetchFastingData('owner-1')
    expect(pb.filter).toHaveBeenCalledWith('user = {:user}', { user: 'owner-1' })
    expect(getFullList).toHaveBeenCalledWith({ filter: 'owner-filter', sort: '-started_at', requestKey: null })
    expect(getList).toHaveBeenCalledWith(1, 1, { filter: 'owner-filter', requestKey: null })
    expect(data.sessions).toHaveLength(2)
    expect(data.settings).toEqual({ id: 'settings-1', goalHours: 36, weeklyGoal: 2 })
  })

  it('provides independent defaults before the user configures fasting', async () => {
    getFullList.mockResolvedValue([])
    getList.mockResolvedValue({ items: [] })
    const first = await fetchFastingData('first-owner')
    first.settings.goalHours = 48
    const second = await fetchFastingData('other-owner')
    expect(second).toEqual({ sessions: [], settings: { goalHours: 16, weeklyGoal: 3 } })
  })

  it('propagates unavailable migrations or network errors rather than replacing history with empty data', async () => {
    const error = { status: 404, message: 'Missing fasting collection' }
    getFullList.mockRejectedValue(error)
    getList.mockResolvedValue({ items: [] })
    await expect(fetchFastingData('owner-1')).rejects.toBe(error)
  })
})
