/**
 * Crons: weekly_insights.pb.js (fan-out al AI API).
 *
 * Los tests de recordatorios (meal/workout) vivían aquí y se han eliminado
 * junto con `pb_hooks/push_reminders.pb.js`: la evaluación ya no ocurre en un
 * cron de PocketBase, porque su JSVM (goja) no tiene `Intl` y no podía
 * convertir a la zona horaria del usuario. Ahora la hace
 * `mcp-server/src/api/reminder-dispatcher.ts`, cubierto por
 * `reminder-dispatcher.test.ts` (zonas horarias, ventana de gracia,
 * idempotencia por día local, progreso de calorías y textos).
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import {
  createUser, create, triggerCron, resetPushes, pushes, waitForPush, sleep,
} from "./helpers/client.mjs"

test("weekly_cross_insight no pide insight para usuarios sin token", async () => {
  await resetPushes()
  const user = await createUser("Sin Token")

  await triggerCron("weekly_cross_insight")
  await sleep(800)

  const all = await pushes()
  const mine = all.filter((p) => p.path === "/api/cron/generate-cross-insight" && p.body?.user_id === user.id)
  assert.equal(mine.length, 0, "sin push token → sin request de insight")
})

test("weekly_cross_insight pide un insight por usuario con push token", async () => {
  await resetPushes()
  const user = await createUser("Usuario Insight")
  await create("expo_push_tokens", {
    user: user.id,
    token: "ExponentPushToken[hooks-test]",
    platform: "android",
  })

  await triggerCron("weekly_cross_insight")

  const req = await waitForPush(
    (p) => p.path === "/api/cron/generate-cross-insight" && p.body?.user_id === user.id,
    "request de insight para el usuario"
  )
  assert.equal(req.body.period_type, "weekly")
  assert.equal(req.internalKey, "test-internal-key", "manda la X-Internal-Key")
})
