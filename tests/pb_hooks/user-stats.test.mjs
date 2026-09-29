/**
 * workout_stats.pb.js — `user_stats` se mantiene con los TRES tipos de sesion
 * (fuerza, circuito y cardio), no solo con circuitos, y la fila se crea sola si
 * no existe. Issue #412.
 *
 * La racha es SEMANAL (#801): semanas de calendario (lunes a domingo) con al
 * menos `objetivo` dias distintos de entreno (3 por defecto; el historial
 * `settings.weekly_goal_log` lo cambia). Cada entreno recalcula la racha desde
 * TODO el historial, asi que las fechas de los tests son relativas a hoy.
 *
 * La cobertura de circuitos vive en `workout-fanout.test.mjs` desde antes de
 * mover el hook: sirve de red para la refactorizacion, asi que aqui no se
 * duplica — se cubre lo que antes no existia.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, createAs, create, update, list, listAs, waitFor,
  localDateString, expectNotifications, pushesFor,
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

/** Una sesion de fuerza completada en una fecha fija ("YYYY-MM-DD"). */
function strengthSessionOn(user, day, key) {
  return createAs(user, "sessions", {
    user: user.id,
    workout_key: key,
    phase: 1,
    day: "day1",
    completed_at: `${day} 10:00:00`,
  })
}

/** Lunes de la semana de `day` ("YYYY-MM-DD"), con aritmetica UTC. */
function mondayOf(day) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/** `day` desplazado `n` dias. */
function shiftDay(day, n) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Dia `dow` (0 = lunes ... 6 = domingo) de la semana `weeks` semanas respecto a
 * la actual. Todo relativo a HOY (fecha local, como el servidor) para que los
 * tests pasen cualquier dia de la semana. Semana -1 = la pasada, -2 = la anterior.
 */
function weekDay(weeks, dow) {
  return shiftDay(mondayOf(localDateString(0)), weeks * 7 + dow)
}

/** Espera a `total_sessions` exacto y a la racha esperada. */
function waitForStreak(userId, total, current, best, msg) {
  return waitFor(async () => {
    const [s] = await list("user_stats", `user='${userId}'`)
    if (!s || s.total_sessions !== total) return null
    return s.workout_streak_current === current && s.workout_streak_best === best ? s : null
  }, msg)
}

/** Crea sesiones de fuerza una a una (en orden) en los dias dados. */
async function seedDays(user, days, tag = "s") {
  for (let i = 0; i < days.length; i++) await strengthSessionOn(user, days[i], `${tag}${i}`)
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
  // Racha semanal (#801): un solo dia no cumple la semana (el objetivo es 3).
  assert.equal(stats.workout_streak_current, 0, "un dia no cumple la semana")
  assert.equal(stats.workout_streak_best, 0)
  assert.equal(stats.last_workout_date, localDateString(0))
  assert.equal(stats.level, 1, "nivel 1, no 0")
})

test("racha semanal: objetivo 3 por defecto; 3 dias distintos la semana pasada → 1, y la anterior → 2", async () => {
  const user = await createUser("Racha Semanal")
  await seedDays(user, [weekDay(-1, 0), weekDay(-1, 2), weekDay(-1, 4)], "a")
  await waitForStreak(user.id, 3, 1, 1, "semana pasada cumplida → racha 1 (la actual aun no cuenta)")

  await seedDays(user, [weekDay(-2, 1), weekDay(-2, 3), weekDay(-2, 5)], "b")
  await waitForStreak(user.id, 6, 2, 2, "dos semanas seguidas → racha 2")
})

test("racha semanal: una semana con solo 2 dias rompe la racha; best se conserva", async () => {
  const user = await createUser("Racha Rota")
  // -3 y -2 cumplidas (3 dias), -1 floja (2 dias): current 0, best 2.
  await seedDays(user, [
    weekDay(-3, 0), weekDay(-3, 2), weekDay(-3, 4),
    weekDay(-2, 0), weekDay(-2, 2), weekDay(-2, 4),
    weekDay(-1, 1), weekDay(-1, 3),
  ])
  await waitForStreak(user.id, 8, 0, 2, "la semana pasada con 2 dias rompe la racha")
})

test("racha semanal: varias sesiones el mismo dia cuentan como un solo dia", async () => {
  const user = await createUser("Racha Mismo Dia")
  const day = weekDay(-1, 2)
  await seedDays(user, [day, day, day])
  await waitForStreak(user.id, 3, 0, 0, "3 sesiones en 1 dia no cumplen el objetivo de 3")
})

test("racha semanal: una sesion retroactiva recalcula TODO el historial", async () => {
  const user = await createUser("Racha Retroactiva")
  // Semana -2 con 2 dias (floja) y semana -1 con 3 (cumplida): solo cuenta la pasada.
  await seedDays(user, [
    weekDay(-2, 0), weekDay(-2, 2),
    weekDay(-1, 0), weekDay(-1, 2), weekDay(-1, 4),
  ])
  await waitForStreak(user.id, 5, 1, 1, "solo la semana pasada cumple")

  // Se registra a mano un tercer dia de la semana -2: ahora cumple → 2 seguidas.
  await strengthSessionOn(user, weekDay(-2, 4), "retro")
  const s = await waitForStreak(user.id, 6, 2, 2, "el dia retroactivo completa la semana -2")
  assert.equal(s.last_workout_date, weekDay(-1, 4), "last_workout_date no retrocede")
})

test("racha semanal: cambiar weekly_goal_log recalcula sin ningun entreno nuevo", async () => {
  const user = await createUser("Racha Objetivo")
  await seedDays(user, [weekDay(-1, 1), weekDay(-1, 4)])
  await waitForStreak(user.id, 2, 0, 0, "2 dias con objetivo 3 (por defecto) → 0")

  const settings = await create("settings", { user: user.id, phase: 1 })
  // Objetivo 2 desde hace 30 dias: la semana pasada pasa a cumplirse.
  await update("settings", settings.id, {
    weekly_goal_log: [{ from: localDateString(-30), goal: 2 }],
  })
  await waitForStreak(user.id, 2, 1, 1, "el hook de settings recalcula: 0 → 1")

  // Y a la inversa: subir el objetivo a 4 la vuelve a romper.
  await update("settings", settings.id, {
    weekly_goal_log: [{ from: localDateString(-30), goal: 4 }],
  })
  await waitForStreak(user.id, 2, 0, 0, "objetivo 4: la semana ya no cumple")
})

test("racha semanal: cuentan sesiones, circuitos y cardio en dias distintos", async () => {
  const user = await createUser("Racha Mixta")
  await strengthSessionOn(user, weekDay(-1, 0), "mix")
  await createAs(user, "circuit_sessions", {
    user: user.id, mode: "rounds", rounds_completed: 3,
    started_at: `${weekDay(-1, 2)}T12:00:00.000Z`,
    finished_at: `${weekDay(-1, 2)}T12:30:00.000Z`,
  })
  await createAs(user, "cardio_sessions", {
    user: user.id, activity_type: "run", distance_km: 5, duration_seconds: 1800,
    started_at: `${weekDay(-1, 4)}T12:00:00.000Z`,
    finished_at: `${weekDay(-1, 4)}T12:30:00.000Z`,
  })
  await waitForStreak(user.id, 3, 1, 1, "3 tipos en 3 dias distintos → racha 1")
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
  assert.equal(stats.workout_streak_current, 0, "un dia no cumple la semana")
  assert.equal(stats.workout_streak_best, 0)
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

  // El cardio lleva fecha UTC y la fuerza/circuito la local (ver la nota de
  // FECHAS en utils/workout_stats.js): como mucho son 2 dias distintos, asi que
  // tres sesiones nunca cumplen el objetivo de 3 dias.
  assert.equal(stats.workout_streak_current, 0, "tres sesiones no son tres dias")
})

test("EL SINTOMA DEL ISSUE: otra cuenta ve los numeros reales en el perfil ajeno", async () => {
  // Reproduce lo que se veia en /u/:id — "0 SESIONES 0 RACHA 0 MEJOR NIVEL 1"
  // mientras el calendario y "Sesiones recientes" de esa misma pantalla si
  // pintaban datos. El perfil ajeno lee por la view `public_user_stats` (#410).
  const atleta = await createUser("Atleta Perfil")
  const curioso = await createUser("Curioso Perfil")

  // Tres dias de la semana pasada: cumple la semana → racha 1 (#801).
  await seedDays(atleta, [weekDay(-1, 0), weekDay(-1, 2), weekDay(-1, 4)], "p")

  const stats = await waitFor(async () => {
    const [row] = await listAs(curioso, "public_user_stats", `user='${atleta.id}'`)
    return row && row.total_sessions === 3 && row.workout_streak_current === 1 ? row : null
  }, "el perfil ajeno ve 3 sesiones y racha 1, no 0")

  assert.equal(stats.workout_streak_best, 1)
  assert.equal(stats.last_workout_date, weekDay(-1, 4))
  assert.equal(stats.streak_week_mask, undefined, "el estado interno de la racha ya no existe")
  // La view sigue tapando lo que debe tapar.
  assert.equal(stats.total_nutrition_logs, undefined, "nutricion sigue oculta")
})

test("varias sesiones a la vez no pierden cuenta ni duplican la fila", async () => {
  // Caso real: la cola de reintentos vacia varias sesiones de golpe, o el
  // usuario da doble toque. Sin fila previa, las 15 compiten por crearla.
  //
  // Este test PILLO UN BUG DE VERDAD: con el patron leer-sumar-guardar del hook
  // viejo se perdian incrementos (falló primero en CI, luego en local subiendo a
  // 15). Por eso `recordWorkout` escribe con un UPDATE atomico. Si alguien lo
  // vuelve a convertir en un save() de record, este test se pone rojo.
  const user = await createUser("Atleta Concurrente")

  await Promise.all(
    Array.from({ length: 15 }, (_, i) => strengthSession(user, 0, `paralela${i}`))
  )

  const stats = await waitFor(async () => {
    const rows = await list("user_stats", `user='${user.id}'`)
    return rows.length === 1 && rows[0].total_sessions === 15 ? rows[0] : null
  }, "una sola fila y las 15 sesiones contadas")

  assert.equal(stats.workout_streak_current, 0, "quince sesiones el mismo dia no cumplen la semana")
})

test("sesiones en paralelo en dias distintos de la semana pasada: total exacto y racha 1", async () => {
  // Cada escritura recalcula la racha entera dentro de una transaccion: 6 a la
  // vez no pueden perder sesiones ni dejar una racha a medias.
  const user = await createUser("Atleta Concurrente Semanal")
  const days = [weekDay(-1, 0), weekDay(-1, 2), weekDay(-1, 4)]

  await Promise.all(
    Array.from({ length: 6 }, (_, i) => strengthSessionOn(user, days[i % 3], `par${i}`))
  )

  await waitForStreak(user.id, 6, 1, 1, "6 sesiones contadas y racha 1")
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

test("la racha de fuerza dispara el hito de 4 semanas (una sola vez, con push)", async () => {
  const user = await createUser("Atleta Milestone")
  // Semana -1 con 2 dias y las semanas -2..-4 completas: la racha sigue en 0
  // porque la pasada no cumple. El 3er dia de la semana -1, lo ultimo, las une:
  // 0 → 4 semanas.
  await seedDays(user, [weekDay(-1, 0), weekDay(-1, 2)], "u")
  await seedDays(user, [weekDay(-2, 0), weekDay(-2, 2), weekDay(-2, 4)], "v")
  await seedDays(user, [weekDay(-3, 0), weekDay(-3, 2), weekDay(-3, 4)], "w")
  await seedDays(user, [weekDay(-4, 0), weekDay(-4, 2), weekDay(-4, 4)], "x")
  await waitForStreak(user.id, 11, 0, 3, "3 semanas cumplidas pero la pasada floja: racha 0, best 3")
  await expectNotifications(user.id, "streak", 0, "aun sin hito")

  await strengthSessionOn(user, weekDay(-1, 4), "cierre")
  await waitForStreak(user.id, 12, 4, 4, "racha 4")
  const [notif] = await expectNotifications(user.id, "streak", 1, "el hito de 4 semanas se notifica una vez")
  assert.equal(notif.data.weeks, 4)

  await waitFor(async () => {
    const sent = await pushesFor(user.id)
    return sent.some((p) => JSON.stringify(p.body).includes("4 semanas"))
  }, "push de 4 semanas seguidas")
})
