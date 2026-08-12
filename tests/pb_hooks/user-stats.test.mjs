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
  createUser, createAs, create, update, getOne, list, listAs, waitFor,
  localDateString, expectNotifications,
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

test("EL SINTOMA DEL ISSUE: otra cuenta ve los numeros reales en el perfil ajeno", async () => {
  // Reproduce lo que se veia en /u/:id — "0 SESIONES 0 RACHA 0 MEJOR NIVEL 1"
  // mientras el calendario y "Sesiones recientes" de esa misma pantalla si
  // pintaban datos. El perfil ajeno lee por la view `public_user_stats` (#410).
  const atleta = await createUser("Atleta Perfil")
  const curioso = await createUser("Curioso Perfil")

  await strengthSession(atleta, -1, "ayer")
  await strengthSession(atleta, 0, "hoy")

  const stats = await waitFor(async () => {
    const [row] = await listAs(curioso, "public_user_stats", `user='${atleta.id}'`)
    return row && row.total_sessions === 2 ? row : null
  }, "el perfil ajeno ve 2 sesiones, no 0")

  assert.equal(stats.workout_streak_current, 2, "y la racha de 2 dias")
  assert.equal(stats.workout_streak_best, 2)
  assert.equal(stats.last_workout_date, localDateString(0))
  // La view sigue tapando lo que debe tapar.
  assert.equal(stats.total_nutrition_logs, undefined, "nutricion sigue oculta")
})

test("varias sesiones a la vez no pierden cuenta ni duplican la fila", async () => {
  // Caso real: la cola de reintentos vacia varias sesiones de golpe, o el
  // usuario da doble toque. Sin fila previa, las 5 compiten por crearla.
  const user = await createUser("Atleta Concurrente")

  await Promise.all(
    [1, 2, 3, 4, 5].map((i) => strengthSession(user, 0, `paralela${i}`))
  )

  const stats = await waitFor(async () => {
    const rows = await list("user_stats", `user='${user.id}'`)
    return rows.length === 1 && rows[0].total_sessions === 5 ? rows[0] : null
  }, "una sola fila y las 5 sesiones contadas")

  assert.equal(stats.workout_streak_current, 1, "cinco sesiones el mismo dia = racha 1")
})

test("un cardio sin fechas no rompe nada: cae al dia del servidor", async () => {
  // `sessions.completed_at` es obligatorio, pero `started_at`/`finished_at` de
  // cardio y circuito son texto opcional, asi que el fallback tiene que existir.
  const user = await createUser("Atleta Sin Fecha")

  await createAs(user, "cardio_sessions", {
    user: user.id, activity_type: "run", distance_km: 3, duration_seconds: 900,
  })

  const stats = await waitForStats(
    user.id,
    (s) => s.total_sessions === 1,
    "se cuenta igual",
  )
  assert.equal(stats.last_workout_date, localDateString(0), "usa el dia del servidor")
})

test("la racha de fuerza dispara el milestone de 7 dias (antes solo la de circuitos)", async () => {
  const user = await createUser("Atleta Milestone")
  await create("user_stats", {
    user: user.id,
    total_sessions: 6,
    workout_streak_current: 6,
    workout_streak_best: 6,
    last_workout_date: localDateString(-1),
  })

  await strengthSession(user, 0, "el-septimo")

  await waitForStats(user.id, (s) => s.workout_streak_current === 7, "racha 6→7")
  await expectNotifications(user.id, "streak", 1, "el hook de milestones se entera")
})
