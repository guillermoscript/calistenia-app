import { describe, it, expect, vi, beforeEach } from 'vitest'
import { storage } from '../platform'
import { USER_SCOPED_STORAGE_KEYS, clearUserStorage } from './storage-keys'

vi.mock('../platform', () => ({
  storage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

const EXPECTED_KEYS = [
  'calistenia_progress',
  'calistenia_settings',
  'calistenia_water',
  'calistenia_water_goal',
  'calistenia_weight_entries',
  'calistenia_sleep_entries',
  'calistenia_body_measurements',
  'calistenia_rest_prefs',
  'calistenia_meal_reminders',
  'calistenia_workout_reminders',
  'calistenia_weekly_plan',
  'calistenia_nutrition_entries',
  'calistenia_nutrition_goals',
  'calistenia_exercise_favorites',
  'calistenia_rq_cache',
]

describe('USER_SCOPED_STORAGE_KEYS', () => {
  it('contiene exactamente las 15 claves de localStorage por usuario', () => {
    expect(USER_SCOPED_STORAGE_KEYS).toHaveLength(15)
    expect([...USER_SCOPED_STORAGE_KEYS].sort()).toEqual([...EXPECTED_KEYS].sort())
  })
})

describe('clearUserStorage', () => {
  beforeEach(() => {
    vi.mocked(storage.removeItem).mockClear()
  })

  it('llama a storage.removeItem una vez por cada clave', () => {
    clearUserStorage()
    expect(storage.removeItem).toHaveBeenCalledTimes(EXPECTED_KEYS.length)
  })

  it('elimina cada clave esperada', () => {
    clearUserStorage()
    for (const key of EXPECTED_KEYS) {
      expect(storage.removeItem).toHaveBeenCalledWith(key)
    }
  })
})
