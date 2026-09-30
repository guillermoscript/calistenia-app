/**
 * El port de servidor de la racha semanal (`pb_hooks/utils/weekly_streak.js`,
 * #801) contra el MISMO fixture que `weeklyStreak.test.ts`. Así la racha de
 * `user_stats` y la del inicio no pueden divergir: si una regla cambia en un
 * lado y no en el otro, uno de los dos tests se pone rojo.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeWeeklyStreak as clientCompute, goalForWeekFromChanges as clientGoals } from './weeklyStreak'

const here = path.dirname(fileURLToPath(import.meta.url))

// El fichero es CommonJS para el `require` de goja, pero el `package.json` de la
// raíz es `"type": "module"` y node no lo cargaría como tal: se evalúa con un
// `module` propio. Los globals de PocketBase (`$app`, `arrayOf`…) solo se usan
// dentro de las funciones con base de datos, que aquí no se llaman.
function loadServerModule() {
  const src = fs.readFileSync(path.resolve(here, '../../../pb_hooks/utils/weekly_streak.js'), 'utf8')
  const mod = { exports: {} as Record<string, any> }
  new Function('module', 'exports', src)(mod, mod.exports)
  return mod.exports
}
const server = loadServerModule()

interface FixtureCase {
  name: string
  today: string
  goal?: number
  goalChanges?: { from: string; goal: number }[]
  fallbackGoal?: number
  doneDates: string[]
  expected: unknown
}

const { cases } = JSON.parse(fs.readFileSync(path.join(here, '__fixtures__/weekly-streak.json'), 'utf8')) as { cases: FixtureCase[] }

describe('pb_hooks/utils/weekly_streak.js · __fixtures__/weekly-streak.json', () => {
  it.each(cases.map(c => [c.name, c] as const))('%s', (_name, c) => {
    const goal = c.goalChanges ? server.goalForWeekFromChanges(c.goalChanges, c.fallbackGoal ?? 3) : (c.goal ?? 3)
    expect(server.computeWeeklyStreak(c.doneDates, goal, c.today)).toEqual(c.expected)
  })

  it('usa los mismos hitos y el mismo objetivo histórico que el cliente', async () => {
    const core = await import('./weeklyStreak')
    expect(server.WEEKLY_STREAK_MILESTONES).toEqual([...core.WEEKLY_STREAK_MILESTONES])
    expect(server.FALLBACK_GOAL).toBe(core.HISTORICAL_WEEKLY_GOAL)
  })

  it('da lo mismo que el cliente en historias largas generadas', () => {
    // Semilla fija: el test es determinista.
    let seed = 801
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    for (let n = 0; n < 200; n++) {
      const days: string[] = []
      for (let d = 0; d < 400; d++) {
        if (rand() < 0.45) days.push(server.shiftDay('2025-06-01', d))
      }
      const changes = [
        { from: server.shiftDay('2025-06-01', Math.floor(rand() * 400)), goal: 1 + Math.floor(rand() * 6) },
        { from: server.shiftDay('2025-06-01', Math.floor(rand() * 400)), goal: 1 + Math.floor(rand() * 6) },
      ]
      const today = server.shiftDay('2025-06-01', 300 + Math.floor(rand() * 100))
      expect(server.computeWeeklyStreak(days, server.goalForWeekFromChanges(changes, 3), today))
        .toEqual(clientCompute(days, clientGoals(changes, 3), today))
    }
  })

  it('parseGoalLog descarta lo que no es un cambio válido', () => {
    expect(server.parseGoalLog('[{"from":"2026-09-01","goal":4},{"from":"x","goal":2},{"from":"2026-09-02"},null]'))
      .toEqual([{ from: '2026-09-01', goal: 4 }])
    expect(server.parseGoalLog('no-json')).toEqual([])
    expect(server.parseGoalLog('')).toEqual([])
    expect(server.parseGoalLog('{"from":"2026-09-01","goal":4}')).toEqual([])
  })
})
