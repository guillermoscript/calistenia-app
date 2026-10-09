/**
 * Filtro de qué se persiste en disco (`CORE_DEHYDRATE_OPTIONS`).
 *
 * Usa keys REALES de `qk`: si alguien renombra una key, el prefijo de la
 * denylist deja de casar y este test falla, en vez de volver a persistirse (o
 * dejar de persistirse) algo en silencio.
 */
import { describe, it, expect } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { dehydrate } from '@tanstack/react-query'
import { CORE_DEHYDRATE_OPTIONS, isNoPersistKey } from './query-client'
import { qk } from './query-keys'

const U = 'u1'

const EXCLUDED: [string, readonly unknown[]][] = [
  ['sessions', qk.sessions(U, 'p1')],
  ['feed.sessions', qk.feed.sessions(U, ['a', 'b'])],
  ['feed.users', qk.feed.users(['a'])],
  ['reactions', qk.reactions(U, ['s1'])],
  ['comments.list', qk.comments.list('s1', U)],
  ['comments.counts', qk.comments.counts(['s1'], U)],
  ['commentReactions', qk.commentReactions('c1', U)],
  ['exerciseCatalog', qk.exerciseCatalog],
  ['programs.detailView', qk.programs.detailView('p1')],
  ['programs.stats', qk.programs.stats(['p1', 'p2'])],
  ['programs.publicPreview', qk.programs.publicPreview('p1')],
  ['weight', qk.weight(U)],
  ['sleep', qk.sleep(U)],
  ['bodyMeasurements', qk.bodyMeasurements(U)],
  ['weeklyMealPlan.active', qk.weeklyMealPlan.active(U)],
  ['weeklyMealPlan.days', qk.weeklyMealPlan.days('plan1')],
  ['water.day', qk.water.day(U, '2026-01-01')],
  ['water.goal', qk.water.goal(U)],
  ['workoutReminders', qk.workoutReminders(U)],
  ['cardioSessions', qk.cardioSessions(U)],
  ['foods.search', qk.foods.search('pollo')],
  ['nutrition.byDate', qk.nutrition.byDate(U, '2026-01-01')],
  ['nutrition.range', qk.nutrition.range(U, 'a', 'b')],
  ['nutrition.badges', qk.nutrition.badges(U)],
  ['nutrition.insightDaily', qk.nutrition.insightDaily(U, 'd')],
  ['nutrition.insightWeekly', qk.nutrition.insightWeekly(U, 'w')],
  ['challenge', qk.challenge('c1')],
  ['challengeLeaderboard', qk.challengeLeaderboard('c1', U)],
  ['expressProgress', qk.expressProgress('c1')],
  ['communityProgram', qk.communityProgram('p1', U)],
  ['races.prsFinished', qk.races.prsFinished(U)],
  ['suggestedUsers', qk.suggestedUsers(U)],
]

const KEPT: [string, readonly unknown[]][] = [
  ['programs.catalog', qk.programs.catalog(U)],
  ['programs.enrollment', qk.programs.enrollment(U)],
  ['programs.detail', qk.programs.detail('p1')],
  ['programs.overrides', qk.programs.overrides(U, 'p1')],
  ['lifetimeSessions/accountSessions', qk.accountSessions(U)],
  ['accountSessions con sello', qk.accountSessions(U, '3')],
  ['streakDays', qk.streakDays(U, 's')],
  ['appConfig', qk.appConfig],
  ['feed.meta', qk.feed.meta(U)],
  ['nutrition.today', qk.nutrition.today(U)],
  ['nutrition.goals', qk.nutrition.goals(U)],
  // Prefijos parecidos que NO deben caer en la denylist por error.
  ['communityPrograms (lista)', qk.communityPrograms(U)],
  ['challenges (lista)', qk.challenges(U)],
]

describe('CORE_DEHYDRATE_OPTIONS — denylist de persistencia', () => {
  it.each(EXCLUDED)('excluye %s', (_n, key) => {
    expect(isNoPersistKey(key)).toBe(true)
  })

  it.each(KEPT)('conserva %s', (_n, key) => {
    expect(isNoPersistKey(key)).toBe(false)
  })

  it('dehydrate respeta el filtro y nunca vuelca mutaciones', async () => {
    const qc = new QueryClient()
    qc.setQueryData(qk.sessions(U, 'p1'), { big: 'x'.repeat(100) })
    qc.setQueryData(qk.programs.enrollment(U), { id: 'e1' })
    // Mutación pausada: aun así no debe persistirse.
    const m = qc.getMutationCache().build(qc, { mutationFn: async () => 1 })
    m.state.isPaused = true
    const state = dehydrate(qc, CORE_DEHYDRATE_OPTIONS)
    expect(state.queries.map(q => q.queryKey)).toEqual([qk.programs.enrollment(U)])
    expect(state.mutations).toEqual([])
  })
})
