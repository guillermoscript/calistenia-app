/**
 * Logros tempranos (#802): `recordWorkout` crea las filas de `user_achievements`
 * de `first_workout`, `three_workouts` y `first_week_complete`, una sola vez por
 * usuario, y avisa solo a cuentas nuevas.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { createUser, createAs, list, waitFor, localDateString } from "./helpers/client.mjs"

function session(user, day, key) {
  return createAs(user, "sessions", {
    user: user.id, workout_key: key, phase: 1, day: "day1",
    completed_at: `${day} 10:00:00`,
  })
}

async function unlockedKeys(userId) {
  const rows = await list("user_achievements", `user='${userId}' && unlocked=true`)
  const out = []
  for (const row of rows) {
    const [ach] = await list("achievements", `id='${row.achievement}'`)
    out.push(ach.key)
  }
  return out.sort()
}

test("la migracion siembra los tres logros tempranos", async () => {
  const rows = await list("achievements", `key='first_workout' || key='three_workouts' || key='first_week_complete'`)
  assert.equal(rows.length, 3)
})

test("el primer entreno desbloquea first_workout; el tercero three_workouts; sin duplicados", async () => {
  const user = await createUser("Logros Tempranos")
  await session(user, localDateString(0), "a")
  await waitFor(async () => (await unlockedKeys(user.id)).includes("first_workout") || null, "first_workout")
  assert.deepEqual(await unlockedKeys(user.id), ["first_workout"])

  // Misma jornada, mas sesiones: sigue siendo una sola fila por logro.
  await session(user, localDateString(0), "b")
  await session(user, localDateString(0), "c")
  await waitFor(async () => (await unlockedKeys(user.id)).includes("three_workouts") || null, "three_workouts")
  const rows = await list("user_achievements", `user='${user.id}'`)
  assert.equal(rows.length, 2, "una fila por logro, sin repetir")
})

test("tres dias distintos la semana pasada desbloquean first_week_complete", async () => {
  const user = await createUser("Logros Semana")
  const monday = (() => {
    const d = new Date(`${localDateString(0)}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7)
    return d
  })()
  const day = (n) => { const d = new Date(monday); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
  await session(user, day(0), "a")
  await session(user, day(2), "b")
  await session(user, day(4), "c")
  await waitFor(async () => (await unlockedKeys(user.id)).includes("first_week_complete") || null, "first_week_complete")
  assert.deepEqual(await unlockedKeys(user.id), ["first_week_complete", "first_workout", "three_workouts"])
})
