/**
 * #694 — `/session` sin sesión activa consume la intención de primer entreno
 * dejada por el onboarding (`markFirstWorkoutPending` → `takeFirstWorkoutPending`,
 * ver `packages/core/lib/first-workout.ts`) antes de decidir si redirige a '/'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }),
}))

const h = vi.hoisted(() => ({
  startSession: vi.fn(),
  endSession: vi.fn(),
  takePending: vi.fn(),
  trackStarted: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('../contexts/ActiveSessionContext', () => ({
  useActiveSession: () => ({
    isActive: false,
    workout: null,
    workoutKey: '',
    source: 'free',
    startSession: h.startSession,
    endSession: h.endSession,
    getWarmupCooldownData: () => ({}),
    resumeEpoch: 0,
  }),
}))

vi.mock('../contexts/WorkoutContext', () => ({
  useWorkoutActions: () => ({
    logSet: vi.fn(),
    markWorkoutDone: vi.fn(),
    getExerciseLogs: () => [],
    getTotalSessions: () => 0,
  }),
}))

vi.mock('../hooks/useSessionIdentity', () => ({
  useSessionIdentity: () => ({ userId: 'u1' }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => h.navigate,
}))

vi.mock('../components/SessionView', () => ({
  default: () => <div data-testid="session-view-stub" />,
}))

vi.mock('@calistenia/core/lib/catalogIndex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@calistenia/core/lib/catalogIndex')>()),
  loadCatalogIndex: vi.fn(async () => null),
}))

vi.mock('@calistenia/core/lib/first-workout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@calistenia/core/lib/first-workout')>()),
  takeFirstWorkoutPending: h.takePending,
  trackFirstWorkoutStarted: h.trackStarted,
}))

import ActiveSessionPage from './ActiveSessionPage'

describe('ActiveSessionPage sin sesión activa (#694)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('con una intención de primer entreno pendiente, arranca la sesión y no navega', async () => {
    h.takePending.mockReturnValue({
      userId: 'u1', level: 'principiante', source: 'onboarding', createdAt: Date.now(),
    })

    render(<ActiveSessionPage />)

    await waitFor(() => expect(h.startSession).toHaveBeenCalledTimes(1))

    const [workout, key, source] = h.startSession.mock.calls[0]
    expect(workout.exercises).toHaveLength(4)
    expect(key).toMatch(/^free_first_/)
    expect(source).toBe('free')
    expect(h.trackStarted).toHaveBeenCalledWith({ source: 'onboarding', level: 'principiante', workoutKey: key })
    expect(h.navigate).not.toHaveBeenCalled()
  })

  it('sin intención pendiente, navega a "/"', async () => {
    h.takePending.mockReturnValue(null)

    render(<ActiveSessionPage />)

    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/', { replace: true }))
    expect(h.startSession).not.toHaveBeenCalled()
  })
})
