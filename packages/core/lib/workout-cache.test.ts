import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { invalidateAfterWorkout } from './workout-cache'
import { qk } from './query-keys'

const seed = (qc: QueryClient, keys: readonly (readonly unknown[])[]) =>
  keys.forEach(k => qc.setQueryData(k, { v: 1 }))
const stale = (qc: QueryClient, k: readonly unknown[]) => qc.getQueryState(k)!.isInvalidated

describe('invalidateAfterWorkout', () => {
  const uid = 'u1'

  it('invalida sesiones (cualquier programa), cuenta (con y sin sello) y racha', () => {
    const qc = new QueryClient()
    const keys = [
      qk.sessions(uid, 'p1'), qk.sessions(uid, null),
      qk.accountSessions(uid), qk.accountSessions(uid, 's1'), qk.streakDays(uid, 's1'),
    ]
    seed(qc, keys)
    invalidateAfterWorkout(qc, uid)
    for (const k of keys) expect(stale(qc, k)).toBe(true)
  })

  it('no toca el cardio salvo que se pida, ni las claves de otro usuario', () => {
    const qc = new QueryClient()
    seed(qc, [qk.cardioSessions(uid), qk.sessions('u2', 'p1'), qk.accountSessions('u2')])
    invalidateAfterWorkout(qc, uid)
    expect(stale(qc, qk.cardioSessions(uid))).toBe(false)
    expect(stale(qc, qk.sessions('u2', 'p1'))).toBe(false)
    expect(stale(qc, qk.accountSessions('u2'))).toBe(false)
    invalidateAfterWorkout(qc, uid, { cardio: true })
    expect(stale(qc, qk.cardioSessions(uid))).toBe(true)
  })

  it('sin usuario no invalida nada', () => {
    const qc = new QueryClient()
    seed(qc, [qk.sessions(null, null)])
    invalidateAfterWorkout(qc, null)
    expect(stale(qc, qk.sessions(null, null))).toBe(false)
  })
})
