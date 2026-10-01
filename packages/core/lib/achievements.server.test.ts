/**
 * El port de servidor (`pb_hooks/utils/achievements.js`, #802) contra core:
 * mismos umbrales y mismas keys para las mismas stats.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { EARLY_ACHIEVEMENTS, evaluateEarlyAchievements } from './achievements'

const here = path.dirname(fileURLToPath(import.meta.url))

function loadServerModule() {
  const src = fs.readFileSync(path.resolve(here, '../../../pb_hooks/utils/achievements.js'), 'utf8')
  const mod = { exports: {} as Record<string, any> }
  new Function('module', 'exports', src)(mod, mod.exports)
  return mod.exports
}
const server = loadServerModule()

describe('pb_hooks/utils/achievements.js', () => {
  it('el catálogo coincide con core (key, orden y umbral)', () => {
    expect(server.EARLY.map((d: any) => [d.key, d.target])).toEqual(EARLY_ACHIEVEMENTS.map(d => [d.key, d.target]))
    expect(server.EARLY.map((d: any) => d.kind)).toEqual(EARLY_ACHIEVEMENTS.map(d => d.metric))
  })

  it('evalúa igual que core en una malla de stats', () => {
    for (let workouts = 0; workouts <= 5; workouts++) {
      for (let weeks = 0; weeks <= 3; weeks++) {
        const stats = { totalWorkouts: workouts, bestWeeklyStreak: weeks }
        expect(server.evaluateEarlyAchievements(stats), JSON.stringify(stats)).toEqual(evaluateEarlyAchievements(stats))
      }
    }
  })

  it('solo avisa a cuentas nuevas', () => {
    expect(server.shouldNotify(1)).toBe(true)
    expect(server.shouldNotify(server.NOTIFY_MAX_WORKOUTS)).toBe(true)
    expect(server.shouldNotify(server.NOTIFY_MAX_WORKOUTS + 1)).toBe(false)
  })
})
