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

/** Lunes de la semana de `day` ("YYYY-MM-DD"). */
function mondayOf(day) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/** Bit del dia en la mascara semanal (lunes = 1 ... domingo = 64). */
function weekdayBit(day) {
  return 1 << ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7)
}

// Semanas fijas del pasado para que los tests no dependan del dia en que corren.
// 2026-08-03, 08-10, 08-17 y 08-24 son lunes.

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
  // Racha semanal (#801): un solo dia no cumple la semana (hacen falta 2).
  assert.equal(stats.workout_streak_current, 0, "un dia no cumple la semana")
  assert.equal(stats.workout_streak_best, 0)
  assert.equal(stats.streak_week_start, mondayOf(localDateString(0)))
  assert.equal(stats.streak_week_mask, weekdayBit(localDateString(0)))
  assert.equal(stats.last_workout_date, localDateString(0))
  assert.equal(stats.level, 1, "nivel 1, no 0")
})

test("racha semanal: sigue con la semana cumplida, sube al segundo dia y se rompe al saltarse una", async () => {
  const user = await createUser("Fuerza Racheado")
  const stats = await create("user_stats", {
    user: user.id,
    total_sessions: 5,
    workout_streak_current: 3,
    workout_streak_best: 3,
    last_workout_date: "2026-08-05",
    streak_week_start: "2026-08-03",
    streak_week_mask: 1 | 4, // lunes y miercoles: semana cumplida
  })
  const read = () => getOne("user_stats", stats.id)

  // Lunes de la semana siguiente: la semana nueva se abre, la racha se mantiene.
  await strengthSessionOn(user, "2026-08-10", "w1")
  await waitFor(async () => {
    const s = await read()
    return s.total_sessions === 6 ? s : null
  }, "total 6").then((s) => {
    assert.equal(s.workout_streak_current, 3, "semana nueva sin cumplir: la racha sigue en 3")
    assert.equal(s.streak_week_start, "2026-08-10")
    assert.equal(s.streak_week_mask, 1)
    assert.equal(s.last_workout_date, "2026-08-10")
  })

  // Otra sesion el mismo lunes: suma al total, no cuenta como segundo dia.
  await strengthSessionOn(user, "2026-08-10", "w2")
  await waitFor(async () => {
    const s = await read()
    return s.total_sessions === 7 ? s : null
  }, "total 7").then((s) => {
    assert.equal(s.workout_streak_current, 3, "el mismo dia no cumple la semana")
    assert.equal(s.streak_week_mask, 1)
  })

  // Jueves: segundo dia distinto → semana cumplida → 3 → 4.
  await strengthSessionOn(user, "2026-08-13", "w3")
  await waitFor(async () => {
    const s = await read()
    return s.total_sessions === 8 ? s : null
  }, "total 8").then((s) => {
    assert.equal(s.workout_streak_current, 4, "segundo dia: racha 4")
    assert.equal(s.workout_streak_best, 4, "best acompaña a current")
    assert.equal(s.streak_week_mask, 1 | 8)
  })

  // Tercer dia de la misma semana: ya estaba cumplida, no suma otra vez.
  await strengthSessionOn(user, "2026-08-15", "w4")
  await waitFor(async () => {
    const s = await read()
    return s.total_sessions === 9 ? s : null
  }, "total 9").then((s) => {
    assert.equal(s.workout_streak_current, 4, "una semana suma una sola vez")
  })

  // Se salta la semana del 17 entera y entrena el 27: racha rota, best aguanta.
  await strengthSessionOn(user, "2026-08-27", "w5")
  await waitFor(async () => {
    const s = await read()
    return s.total_sessions === 10 ? s : null
  }, "total 10").then((s) => {
    assert.equal(s.workout_streak_current, 0, "semana saltada → 0")
    assert.equal(s.workout_streak_best, 4, "best no retrocede")
    assert.equal(s.streak_week_start, "2026-08-24")
  })
})

test("racha semanal: una semana con un solo dia rompe la racha aunque la siguiente sea contigua", async () => {
  const user = await createUser("Fuerza Semana Floja")
  const stats = await create("user_stats", {
    user: user.id,
    total_sessions: 9,
    workout_streak_current: 5,
    workout_streak_best: 5,
    last_workout_date: "2026-08-04",
    streak_week_start: "2026-08-03",
    streak_week_mask: 2, // solo el martes: semana NO cumplida
  })

  await strengthSessionOn(user, "2026-08-10", "w1")
  await waitFor(async () => {
    const s = await getOne("user_stats", stats.id)
    return s.total_sessions === 10 ? s : null
  }, "total 10").then((s) => {
    assert.equal(s.workout_streak_current, 0, "la semana del 3 no se cumplio → 0")
    assert.equal(s.workout_streak_best, 5)
  })
})

test("una sesion retroactiva dentro de la semana cuenta su dia una sola vez", async () => {
  const user = await createUser("Fuerza Retroactivo")
  const stats = await create("user_stats", {
    user: user.id,
    total_sessions: 10,
    workout_streak_current: 2, // termina en la semana del 3
    workout_streak_best: 6,
    last_workout_date: "2026-08-13",
    streak_week_start: "2026-08-10",
    streak_week_mask: 8, // solo el jueves 13: semana aun sin cumplir
  })
  const read = () => getOne("user_stats", stats.id)

  // Registrada a mano para el martes 11 (antes del ultimo entreno): completa la
  // semana → 2 → 3, sin mover last_workout_date hacia atras.
  await strengthSessionOn(user, "2026-08-11", "retro1")
  await waitFor(async () => {
    const s = await read()
    return s.total_sessions === 11 ? s : null
  }, "total 11").then((s) => {
    assert.equal(s.workout_streak_current, 3, "el dia retroactivo completa la semana")
    assert.equal(s.streak_week_mask, 2 | 8)
    assert.equal(s.last_workout_date, "2026-08-13", "last_workout_date no retrocede")
  })

  // El mismo martes otra vez: su bit ya estaba, no duplica.
  await strengthSessionOn(user, "2026-08-11", "retro2")
  await waitFor(async () => {
    const s = await read()
    return s.total_sessions === 12 ? s : null
  }, "total 12").then((s) => {
    assert.equal(s.workout_streak_current, 3, "el mismo dia retroactivo no duplica")
  })

  // Una semana anterior a la guardada: suma al total, no reescribe la racha.
  await strengthSessionOn(user, "2026-08-05", "retro3")
  await waitFor(async () => {
    const s = await read()
    return s.total_sessions === 13 ? s : null
  }, "total 13").then((s) => {
    assert.equal(s.workout_streak_current, 3, "la racha no cambia")
    assert.equal(s.workout_streak_best, 6, "el best tampoco")
    assert.equal(s.streak_week_start, "2026-08-10", "la semana guardada no retrocede")
    assert.equal(s.streak_week_mask, 2 | 8)
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
  assert.equal(stats.workout_streak_current, 0, "un dia no cumple la semana")
  assert.equal(stats.workout_streak_best, 0)
  assert.ok(stats.streak_week_mask > 0, "abre la semana")
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
  // FECHAS en utils/workout_stats.js): de noche en America el cardio ya es "mañana"
  // y cuenta como otro dia. Lo que se comprueba es que tres sesiones no son tres dias.
  const local = localDateString(0)
  const utc = new Date().toISOString().slice(0, 10)
  const sameWeekTwoDays = local !== utc && mondayOf(local) === mondayOf(utc)
  assert.equal(stats.workout_streak_current, sameWeekTwoDays ? 1 : 0, "tres sesiones no son tres dias")
  if (local === utc) assert.equal(stats.streak_week_mask, weekdayBit(local))
})

test("EL SINTOMA DEL ISSUE: otra cuenta ve los numeros reales en el perfil ajeno", async () => {
  // Reproduce lo que se veia en /u/:id — "0 SESIONES 0 RACHA 0 MEJOR NIVEL 1"
  // mientras el calendario y "Sesiones recientes" de esa misma pantalla si
  // pintaban datos. El perfil ajeno lee por la view `public_user_stats` (#410).
  const atleta = await createUser("Atleta Perfil")
  const curioso = await createUser("Curioso Perfil")

  // Dos dias de la misma semana: cumple la semana → racha 1 (#801).
  await strengthSessionOn(atleta, "2026-08-03", "lunes")
  await strengthSessionOn(atleta, "2026-08-05", "miercoles")

  const stats = await waitFor(async () => {
    const [row] = await listAs(curioso, "public_user_stats", `user='${atleta.id}'`)
    return row && row.total_sessions === 2 ? row : null
  }, "el perfil ajeno ve 2 sesiones, no 0")

  assert.equal(stats.workout_streak_current, 1, "y la racha de 1 semana")
  assert.equal(stats.workout_streak_best, 1)
  assert.equal(stats.last_workout_date, "2026-08-05")
  assert.equal(stats.streak_week_mask, undefined, "el estado interno de la racha no se expone")
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

test("sesiones en paralelo en dos dias de la misma semana suman la semana UNA vez", async () => {
  // La variante semanal de la carrera: si dos UPDATE vieran la mascara vieja a
  // la vez, los dos creerian ser el segundo dia y la racha subiria 2.
  const user = await createUser("Atleta Concurrente Semanal")
  await create("user_stats", {
    user: user.id,
    workout_streak_current: 1,
    workout_streak_best: 1,
    last_workout_date: "2026-08-05",
    streak_week_start: "2026-08-03",
    streak_week_mask: 1 | 4,
  })

  await Promise.all(
    Array.from({ length: 16 }, (_, i) =>
      strengthSessionOn(user, i % 2 ? "2026-08-11" : "2026-08-12", `par${i}`)
    )
  )

  const stats = await waitFor(async () => {
    const [row] = await list("user_stats", `user='${user.id}'`)
    return row && row.total_sessions === 16 ? row : null
  }, "las 16 sesiones contadas")

  assert.equal(stats.workout_streak_current, 2, "1 → 2, ni mas ni menos")
  assert.equal(stats.streak_week_mask, 2 | 4)
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

test("la racha de fuerza dispara el milestone de 2 semanas", async () => {
  const user = await createUser("Atleta Milestone")
  await create("user_stats", {
    user: user.id,
    total_sessions: 3,
    workout_streak_current: 1,
    workout_streak_best: 1,
    last_workout_date: "2026-08-04",
    streak_week_start: "2026-08-03",
    streak_week_mask: 1 | 2,
  })

  await strengthSessionOn(user, "2026-08-10", "lunes")
  await strengthSessionOn(user, "2026-08-12", "miercoles")

  await waitForStats(user.id, (s) => s.workout_streak_current === 2, "racha 1→2 semanas")
  const [notif] = await expectNotifications(user.id, "streak", 1, "el hook de milestones se entera")
  assert.equal(notif.data.weeks, 2)
})
