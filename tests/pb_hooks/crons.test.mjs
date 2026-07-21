/**
 * Crons: push_reminders.pb.js (meal/workout, disparados manualmente vía
 * POST /api/crons/{id}) y weekly_insights.pb.js (fan-out al AI API).
 *
 * Los reminders matchean hora:minuto actuales — se crean para el minuto actual
 * Y el siguiente para tolerar el cambio de minuto entre el create y el trigger.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, createAs, create, triggerCron, resetPushes, pushes, waitForPush, sleep,
} from "./helpers/client.mjs"

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

/** Reminder para ahora y el minuto siguiente (tolera rollover de hora). */
function nowSlots() {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  const next = m === 59 ? { hour: (h + 1) % 24, minute: 0 } : { hour: h, minute: m + 1 }
  return [{ hour: h, minute: m }, next]
}

test("meal reminder empuja push si no se registró la comida", async () => {
  await resetPushes()
  const user = await createUser("Recordatorio Comida")
  for (const slot of nowSlots()) {
    await createAs(user, "meal_reminders", {
      user: user.id,
      meal_type: "desayuno",
      enabled: true,
      days_of_week: ALL_DAYS,
      ...slot,
    })
  }

  await triggerCron("push_meal_reminders")

  const push = await waitForPush(
    (p) => p.path === "/api/send-push" && p.body?.user_id === user.id,
    "push de meal reminder"
  )
  assert.match(push.body.title, /registrar tu desayuno/)
  assert.equal(push.body.url, "/nutrition")
})

test("meal reminder se salta si la comida ya se registró hoy", async () => {
  await resetPushes()
  const user = await createUser("Ya Comio")
  await createAs(user, "nutrition_entries", {
    user: user.id,
    meal_type: "almuerzo",
    foods: [{ name: "arepa", calories: 300 }],
  })
  for (const slot of nowSlots()) {
    await createAs(user, "meal_reminders", {
      user: user.id,
      meal_type: "almuerzo",
      enabled: true,
      days_of_week: ALL_DAYS,
      ...slot,
    })
  }

  await triggerCron("push_meal_reminders")
  await sleep(800)

  const all = await pushes()
  const mine = all.filter((p) => p.path === "/api/send-push" && p.body?.user_id === user.id)
  assert.equal(mine.length, 0, "sin push: la comida ya estaba registrada")
})

test("workout reminder tipo pausa activa", async () => {
  await resetPushes()
  const user = await createUser("Pausa Activa")
  for (const slot of nowSlots()) {
    await createAs(user, "workout_reminders", {
      user: user.id,
      reminder_type: "pause",
      enabled: true,
      days_of_week: ALL_DAYS,
      ...slot,
    })
  }

  await triggerCron("push_workout_reminders")

  const push = await waitForPush(
    (p) => p.path === "/api/send-push" && p.body?.user_id === user.id,
    "push de pausa activa"
  )
  assert.match(push.body.title, /Pausa Activa/)
  assert.equal(push.body.url, "/workout")
})

test("meal reminder con nutrition_goals muestra el progreso de calorías", async () => {
  await resetPushes()
  const user = await createUser("Con Goals")
  await createAs(user, "nutrition_goals", {
    user: user.id,
    daily_calories: 2000,
    daily_protein: 150,
    daily_carbs: 200,
    daily_fat: 60,
    goal: "maintain",
    weight: 70,
    height: 175,
    age: 30,
    sex: "m",
    activity_level: "moderate",
  })
  // Entrada de OTRO meal_type (almuerzo) — suma calorías sin gatillar el skip de cena
  await createAs(user, "nutrition_entries", {
    user: user.id,
    meal_type: "almuerzo",
    foods: [{ name: "arepa", calories: 300 }],
    total_calories: 300,
  })
  for (const slot of nowSlots()) {
    await createAs(user, "meal_reminders", {
      user: user.id,
      meal_type: "cena",
      enabled: true,
      days_of_week: ALL_DAYS,
      ...slot,
    })
  }

  await triggerCron("push_meal_reminders")

  const push = await waitForPush(
    (p) => p.path === "/api/send-push" && p.body?.user_id === user.id,
    "push de cena con progreso"
  )
  assert.match(push.body.title, /registrar tu cena/)
  assert.equal(push.body.body, "Llevas 300/2000 kcal hoy")
})

test("workout reminder tipo workout (default)", async () => {
  await resetPushes()
  const user = await createUser("Entrena Ya")
  for (const slot of nowSlots()) {
    await createAs(user, "workout_reminders", {
      user: user.id,
      reminder_type: "workout",
      enabled: true,
      days_of_week: ALL_DAYS,
      ...slot,
    })
  }

  await triggerCron("push_workout_reminders")

  const push = await waitForPush(
    (p) => p.path === "/api/send-push" && p.body?.user_id === user.id,
    "push de entrenar"
  )
  assert.match(push.body.title, /Hora de entrenar/)
})

test("reminder con enabled=false no empuja nada", async () => {
  await resetPushes()
  const user = await createUser("Reminder Off")
  for (const slot of nowSlots()) {
    await createAs(user, "meal_reminders", {
      user: user.id,
      meal_type: "desayuno",
      enabled: false,
      days_of_week: ALL_DAYS,
      ...slot,
    })
    await createAs(user, "workout_reminders", {
      user: user.id,
      reminder_type: "workout",
      enabled: false,
      days_of_week: ALL_DAYS,
      ...slot,
    })
  }

  await triggerCron("push_meal_reminders")
  await triggerCron("push_workout_reminders")
  await sleep(800)

  const all = await pushes()
  const mine = all.filter((p) => p.path === "/api/send-push" && p.body?.user_id === user.id)
  assert.equal(mine.length, 0, "deshabilitado → sin push")
})

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
