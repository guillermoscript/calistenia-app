/**
 * workout_stats.pb.js — `user_stats` se mantiene con los TRES tipos de sesion
 * (fuerza, circuito y cardio), no solo con circuitos, y la fila se crea sola si
 * no existe. Issue #412.
 *
 * La cobertura de circuitos vive en `workout-fanout.test.mjs` desde antes de
 * mover el hook: sirve de red para la refactorizacion, asi que aqui no se
 * duplica — se cubre lo que antes no existia.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, createAs, create, update, getOne, list, waitFor, localDateString,
} from "./helpers/client.mjs"

/** Una sesion de fuerza completada el dia indicado (offset en dias sobre hoy). */
function strengthSession(user, dayOffset = 0, key = "w1") {
  return createAs(user, "sessions", {
    user: user.id,
    workout_key: key,
    phase: 1,
    day: "day1",
    // `completed_at` se escribe con hora de pared local, sin `Z` — igual que
    // `nowLocalForPB()` en el cliente.
    completed_at: `${localDateString(dayOffset)} 10:00:00`,
  })
}

/** Espera a que exista la fila de user_stats del usuario y la devuelve. */
function waitForStats(userId, predicate, msg) {
  return waitFor(async () => {
    const [stats] = await list("user_stats", `user='${userId}'`)
    if (!stats) return null
    return predicate(stats) ? stats : null
  }, msg)
}

test("sessions crea la fila de user_stats si no existe y cuenta la sesion", async () => {
  const user = await createUser("Fuerza Sin Fila")

  const before = await list("user_stats", `user='${user.id}'`)
  assert.equal(before.length, 0, "arranca sin fila (nadie la crea al registrarse)")

  await strengthSession(user)

  const stats = await waitForStats(
    user.id,
    (s) => s.total_sessions === 1,
    "la primera sesion de fuerza crea la fila con total 1",
  )
  assert.equal(stats.workout_streak_current, 1, "racha arranca en 1")
  assert.equal(stats.workout_streak_best, 1, "best arranca en 1")
  assert.equal(stats.last_workout_date, localDateString(0))
  assert.equal(stats.level, 1, "nivel 1, no 0")
})

test("sessions continua la racha, la reinicia al romperse y no la infla el mismo dia", async () => {
  const user = await createUser("Fuerza Racheado")
  const stats = await create("user_stats", {
    user: user.id,
    total_sessions: 5,
    workout_streak_current: 3,
    workout_streak_best: 3,
    last_workout_date: localDateString(-1), // ayer → la racha continua
  })

  // 1a del dia: racha 3→4, total 5→6
  await strengthSession(user, 0, "w1")
  await waitFor(async () => {
    const s = await getOne("user_stats", stats.id)
    return s.total_sessions === 6 && s.workout_streak_current === 4 ? s : null
  }, "racha continua: 3→4, total 6").then((s) => {
    assert.equal(s.workout_streak_best, 4, "best acompaña a current")
    assert.equal(s.last_workout_date, localDateString(0))
  })

  // 2a del mismo dia: sube el total, la racha no
  await strengthSession(user, 0, "w2")
  await waitFor(async () => {
    const s = await getOne("user_stats", stats.id)
    return s.total_sessions === 7 ? s : null
  }, "total 7").then((s) => {
    assert.equal(s.workout_streak_current, 4, "misma racha el mismo dia")
  })

  // Racha rota: el ultimo entrenamiento fue hace mucho → vuelve a 1, best aguanta
  await update("user_stats", stats.id, { last_workout_date: "2020-01-01" })
  await strengthSession(user, 0, "w3")
  await waitFor(async () => {
    const s = await getOne("user_stats", stats.id)
    return s.total_sessions === 8 && s.workout_streak_current === 1 ? s : null
  }, "racha rota → 1").then((s) => {
    assert.equal(s.workout_streak_best, 4, "best no retrocede")
  })
})

test("una sesion retroactiva suma al total pero no toca la racha", async () => {
  const user = await createUser("Fuerza Retroactivo")
  const stats = await create("user_stats", {
    user: user.id,
    total_sessions: 10,
    workout_streak_current: 5,
    workout_streak_best: 5,
    last_workout_date: localDateString(0), // ya entreno hoy
  })

  // Registrada a mano para hace tres dias: no puede reescribir la racha viva.
  await strengthSession(user, -3, "retro")
  await waitFor(async () => {
    const s = await getOne("user_stats", stats.id)
    return s.total_sessions === 11 ? s : null
  }, "el total sube a 11").then((s) => {
    assert.equal(s.workout_streak_current, 5, "la racha no cambia")
    assert.equal(s.workout_streak_best, 5, "el best tampoco")
    assert.equal(s.last_workout_date, localDateString(0), "last_workout_date no retrocede")
  })
})

test("cardio_sessions tambien actualiza total y racha, creando la fila", async () => {
  const user = await createUser("Cardio Sin Fila")

  await createAs(user, "cardio_sessions", {
    user: user.id,
    activity_type: "run",
    distance_km: 5,
    duration_seconds: 1800,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  })

  const stats = await waitForStats(
    user.id,
    (s) => s.total_sessions === 1,
    "la primera carrera crea la fila con total 1",
  )
  assert.equal(stats.workout_streak_current, 1, "racha arranca en 1")
  assert.equal(stats.workout_streak_best, 1)
})

test("los tres tipos de sesion se acumulan en el mismo contador", async () => {
  const user = await createUser("Triatleta Stats")

  await strengthSession(user, 0, "mixta")
  await waitForStats(user.id, (s) => s.total_sessions === 1, "fuerza → 1")

  await createAs(user, "circuit_sessions", { user: user.id, mode: "rounds", rounds_completed: 3 })
  await waitForStats(user.id, (s) => s.total_sessions === 2, "circuito → 2")

  await createAs(user, "cardio_sessions", {
    user: user.id,
    activity_type: "walk",
    distance_km: 2,
    duration_seconds: 1200,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  })
  const stats = await waitForStats(user.id, (s) => s.total_sessions === 3, "cardio → 3")

  assert.equal(stats.workout_streak_current, 1, "tres sesiones el mismo dia = un dia de racha")
})
