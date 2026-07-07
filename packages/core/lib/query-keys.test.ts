import { describe, it, expect } from 'vitest'
import { qk } from './query-keys'

describe('qk — keys estáticas', () => {
  it('authReady, pbAvailable y progressions son tuplas fijas', () => {
    expect(qk.authReady).toEqual(['auth', 'ready'])
    expect(qk.pbAvailable).toEqual(['pb', 'available'])
    expect(qk.progressions).toEqual(['exercise_progressions'])
  })
})

describe('qk — estabilidad y distinción de factorías', () => {
  it('la misma llamada produce una key estructuralmente igual', () => {
    expect(qk.follows('u1')).toEqual(qk.follows('u1'))
    expect(qk.programs.detail('p1')).toEqual(qk.programs.detail('p1'))
    expect(qk.nutrition.byDate('u1', '2026-07-01')).toEqual(qk.nutrition.byDate('u1', '2026-07-01'))
  })

  it('argumentos distintos producen keys distintas (para que TanStack no comparta caché)', () => {
    expect(qk.follows('u1')).not.toEqual(qk.follows('u2'))
    expect(qk.programs.detail('p1')).not.toEqual(qk.programs.detail('p2'))
    expect(qk.nutrition.byDate('u1', '2026-07-01')).not.toEqual(qk.nutrition.byDate('u1', '2026-07-02'))
  })

  it('acepta userId null (usuario no autenticado) sin lanzar', () => {
    expect(qk.follows(null)).toEqual(['follows', null])
    expect(qk.favorites(null)).toEqual(['favorites', null])
    expect(qk.programs.detail(null)).toEqual(['programs', 'detail', null])
  })
})

describe('qk — jerarquía de invalidación (sub-keys empiezan con el prefijo de "all")', () => {
  it('programs: catalog/activeEnrollment/detail comparten el prefijo de programs.all', () => {
    const prefix = qk.programs.all[0]
    expect(qk.programs.catalog[0]).toBe(prefix)
    expect(qk.programs.activeEnrollment('u1')[0]).toBe(prefix)
    expect(qk.programs.detail('p1')[0]).toBe(prefix)
  })

  it('feed: meta/sessions/users comparten el prefijo de feed.all', () => {
    const prefix = qk.feed.all[0]
    expect(qk.feed.meta('u1')[0]).toBe(prefix)
    expect(qk.feed.sessions('u1', [])[0]).toBe(prefix)
    expect(qk.feed.users([])[0]).toBe(prefix)
  })

  it('comments: list/counts comparten el prefijo de comments.all', () => {
    const prefix = qk.comments.all[0]
    expect(qk.comments.list('s1', 'u1')[0]).toBe(prefix)
    expect(qk.comments.counts(['s1'], 'u1')[0]).toBe(prefix)
  })

  it('notifications: list/unreadCount comparten el prefijo de notifications.all', () => {
    const prefix = qk.notifications.all[0]
    expect(qk.notifications.list('u1', 20)[0]).toBe(prefix)
    expect(qk.notifications.unreadCount('u1')[0]).toBe(prefix)
  })

  it('referrals: list/stats comparten el prefijo de referrals.all', () => {
    const prefix = qk.referrals.all[0]
    expect(qk.referrals.list('u1')[0]).toBe(prefix)
    expect(qk.referrals.stats('u1')[0]).toBe(prefix)
  })

  it('health: status/daily/dailyRange comparten el prefijo de health.all', () => {
    const prefix = qk.health.all[0]
    expect(qk.health.status('u1')[0]).toBe(prefix)
    expect(qk.health.daily('u1', '2026-07-01')[0]).toBe(prefix)
    expect(qk.health.dailyRange('u1', '2026-07-01', '2026-07-07')[0]).toBe(prefix)
  })

  it('insights: cross/history comparten el prefijo de insights.all', () => {
    const prefix = qk.insights.all[0]
    expect(qk.insights.cross('u1', 'weekly')[0]).toBe(prefix)
    expect(qk.insights.history('u1', 'weekly')[0]).toBe(prefix)
  })

  it('nutrition: todas las sub-keys comparten el prefijo de nutrition.all', () => {
    const prefix = qk.nutrition.all[0]
    expect(qk.nutrition.today('u1')[0]).toBe(prefix)
    expect(qk.nutrition.byDate('u1', '2026-07-01')[0]).toBe(prefix)
    expect(qk.nutrition.range('u1', '2026-07-01', '2026-07-07')[0]).toBe(prefix)
    expect(qk.nutrition.goals('u1')[0]).toBe(prefix)
    expect(qk.nutrition.badges('u1')[0]).toBe(prefix)
    expect(qk.nutrition.insightDaily('u1', '2026-07-01')[0]).toBe(prefix)
    expect(qk.nutrition.insightWeekly('u1', '2026-07-01')[0]).toBe(prefix)
  })
})

describe('qk — dominios sin "all" explícito pero con prefijo interno consistente', () => {
  it('pantry: list/history/spend/currency comparten el prefijo "pantry"', () => {
    expect(qk.pantry.list('u1')[0]).toBe('pantry')
    expect(qk.pantry.history('u1')[0]).toBe('pantry')
    expect(qk.pantry.spend('u1', '2026-07-01')[0]).toBe('pantry')
    expect(qk.pantry.currency('u1')[0]).toBe('pantry')
  })

  it('shopping: active/lastDone/cadence comparten el prefijo "shopping"', () => {
    expect(qk.shopping.active('u1')[0]).toBe('shopping')
    expect(qk.shopping.lastDone('u1')[0]).toBe('shopping')
    expect(qk.shopping.cadence('u1')[0]).toBe('shopping')
  })

  it('weeklyMealPlan: active/days comparten el prefijo "weekly_meal_plans"', () => {
    expect(qk.weeklyMealPlan.active('u1')[0]).toBe('weekly_meal_plans')
    expect(qk.weeklyMealPlan.days('plan1')[0]).toBe('weekly_meal_plans')
  })

  it('foodHistory: recent/hour comparten el prefijo "food_history"', () => {
    expect(qk.foodHistory.recent('u1', 5)[0]).toBe('food_history')
    expect(qk.foodHistory.hour('u1', 12)[0]).toBe('food_history')
  })
})

describe('qk — dominio "races" unificado bajo el prefijo "races"', () => {
  // Como el resto de dominios: invalidar por queryKey: ['races'] (qk.races.all)
  // alcanza a discover, prsFinished y wins.
  it('all/discover/prsFinished/wins comparten el prefijo "races"', () => {
    expect(qk.races.all).toEqual(['races'])
    expect(qk.races.discover({})[0]).toBe('races')
    expect(qk.races.prsFinished('u1')[0]).toBe('races')
    expect(qk.races.wins('u1')[0]).toBe('races')
  })

  it('las keys concretas siguen siendo distinguibles entre sí', () => {
    expect(qk.races.prsFinished('u1')).toEqual(['races', 'prs', 'finished', 'u1'])
    expect(qk.races.wins('u1')).toEqual(['races', 'wins', 'u1'])
  })
})

describe('qk — unicidad de prefijos raíz entre dominios', () => {
  it('no hay colisiones accidentales entre los prefijos de dominios distintos', () => {
    const prefixes = [
      qk.authReady[0], qk.pbAvailable[0],
      qk.follows('u')[0], qk.feed.all[0], qk.comments.all[0],
      qk.commentReactions('c', 'u')[0], qk.reactions('u', [])[0],
      qk.notifications.all[0], qk.notificationPrefs('u')[0],
      qk.referrals.all[0], qk.points.balance('u')[0],
      qk.programs.all[0], qk.programEditor('p')[0], qk.progressions[0],
      qk.sessions('u', 'p')[0], qk.setsLog('u')[0], qk.userSettings('u')[0],
      qk.restPreferences('u')[0], qk.favorites('u')[0], qk.workoutReminders('u')[0],
      qk.leaderboard('u', 'w', 'm')[0], qk.profileCompare('u', 'w', 'm')[0],
      qk.cardioSessions('u')[0], qk.challenges('u')[0], qk.challenge('c')[0],
      qk.challengeLeaderboard('c', 'u')[0], qk.expressProgress('c')[0],
      qk.bodyMeasurements('u')[0], qk.bodyPhotos('u')[0], qk.weight('u')[0],
      qk.sleep('u')[0], qk.health.all[0], qk.water.day('u', 'd')[0],
      qk.insights.all[0], qk.nutrition.all[0], qk.foods.search('q')[0],
      qk.wgerSearch('t', 'es')[0], qk.foodHistory.recent('u', 1)[0],
      qk.mealTemplates('u')[0], qk.freeSessionTemplates('u')[0],
      qk.mealReminders('u')[0], qk.weeklyMealPlan.active('u')[0],
      qk.races.discover({})[0], qk.blogPosts(1, null)[0], qk.blogPost('s', 'es')[0],
      qk.pantry.list('u')[0], qk.shopping.active('u')[0], qk.savedRecipes.list('u')[0],
    ]
    const unique = new Set(prefixes)
    expect(unique.size).toBe(prefixes.length)
  })
})
