/**
 * Views de lectura pública (#386).
 *
 * `block_reads.test.mjs` cubre que el BLOQUEO esconde estas superficies. Esto
 * cubre lo otro que introduce 1783500000_public_read_views.js: que una persona
 * cualquiera —sin bloqueo de por medio— ya no pueda leer la fila entera.
 *
 * Los tres asserts que importan, y por qué:
 *   1. la tabla base contesta 404 a un tercero (si no, la view sobra);
 *   2. la view NO trae los campos privados (si no, no hemos tapado nada);
 *   3. el dueño SIGUE leyendo su fila completa en la tabla base (si no, hemos
 *      roto sus propias pantallas, que es el fallo caro).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { createUser, create, list, listAs, getOneAs, api, authAs, superToken } from "./helpers/client.mjs"

/**
 * Para cada colección: la view que la sustituye de cara al resto del mundo, los
 * campos que NO deben salir por ahí y un campo de control que sí debe salir
 * (si no, un fallo de siembra dejaría pasar el test por la vía equivocada).
 */
const CASES = [
  {
    base: "sessions",
    view: "public_sessions",
    hidden: ["hr_avg", "hr_max", "calories_actual"],
    visible: "workout_key",
  },
  {
    base: "cardio_sessions",
    view: "public_cardio_sessions",
    hidden: ["hr_avg", "hr_max", "calories_actual"],
    visible: "distance_km",
  },
  {
    base: "circuit_sessions",
    view: "public_circuit_sessions",
    // Desde 1784600000 el muro pinta el circuito (nombre, rondas y duración),
    // así que esos campos SÍ viajan. Lo que sigue fuera es la composición del
    // circuito —`exercises` y `config`, que son del dueño— y la frecuencia
    // cardiaca y las calorías del reloj, que es lo que #386 vino a tapar.
    hidden: ["hr_avg", "hr_max", "calories_actual", "exercises", "config"],
    visible: "circuit_name",
  },
  {
    base: "settings",
    view: "public_prs",
    hidden: ["weekly_goal", "water_goal", "start_date"],
    visible: "pr_pullups",
  },
  {
    base: "user_stats",
    view: "public_user_stats",
    hidden: ["total_nutrition_logs", "total_weight_logs", "total_lumbar_checks", "nutrition_streak_current", "last_nutrition_date"],
    visible: "xp",
  },
]

/** Siembra una fila por colección con TODOS los campos sensibles rellenos. */
async function seed(user) {
  const ids = {}
  ids.sessions = (await create("sessions", {
    user: user.id, workout_key: "wk", phase: 1, day: "day1",
    completed_at: "2026-07-21 10:00:00.000Z", note: "nota de sesión",
    hr_avg: 142, hr_max: 178, calories_actual: 430,
  })).id

  ids.cardio_sessions = (await create("cardio_sessions", {
    user: user.id, activity_type: "running", distance_km: 5, duration_seconds: 1800,
    started_at: "2026-07-21 09:00:00", finished_at: "2026-07-21 09:30:00",
    hr_avg: 155, hr_max: 181, calories_actual: 512, calories_burned: 480,
  })).id

  ids.circuit_sessions = (await create("circuit_sessions", {
    user: user.id, mode: "amrap", started_at: "2026-07-21 08:00:00",
    note: "circuito privado", rounds_completed: 7,
    hr_avg: 160, hr_max: 190, calories_actual: 300,
  })).id

  ids.settings = (await create("settings", {
    user: user.id, phase: 2, weekly_goal: 4, water_goal: 2500,
    pr_pullups: 12, pr_pushups: 40,
  })).id

  // `user_stats` la crean los hooks en cuanto el usuario existe; reutilizar.
  const stats = await list("user_stats", `user = '${user.id}'`)
  const statsId = stats.length
    ? stats[0].id
    : (await create("user_stats", { user: user.id })).id
  await api(`/api/collections/user_stats/records/${statsId}`, {
    method: "PATCH",
    token: await superToken(),
    body: {
      xp: 900, level: 4, total_sessions: 30, total_sets: 400,
      total_nutrition_logs: 55, total_weight_logs: 12, total_lumbar_checks: 3,
      nutrition_streak_current: 6, last_nutrition_date: "2026-07-21",
    },
  })
  ids.user_stats = statsId

  return ids
}

test("un tercero no lee la fila completa: la tabla base contesta 404", async () => {
  const owner = await createUser("Views Owner")
  const other = await createUser("Views Other")
  const ids = await seed(owner)

  for (const { base } of CASES) {
    const rows = await listAs(other, base, `user = '${owner.id}'`)
    assert.equal(rows.length, 0, `${base}: un tercero no debería listar filas ajenas (salieron ${rows.length})`)
    const one = await getOneAs(other, base, ids[base])
    assert.equal(one, null, `${base}: getOne ajeno debería dar 404`)
  }
})

test("la view expone lo que pinta la app y nada más", async () => {
  const owner = await createUser("Views Owner2")
  const other = await createUser("Views Other2")
  const ids = await seed(owner)

  for (const { base, view, hidden, visible } of CASES) {
    const rec = await getOneAs(other, view, ids[base])
    assert.ok(rec, `${view}: un tercero sin bloqueo sí debe poder leerla`)
    assert.ok(
      rec[visible] !== undefined,
      `${view}: falta el campo de control '${visible}' — la siembra o la view están mal`
    )
    for (const field of hidden) {
      assert.equal(
        rec[field], undefined,
        `${view}: '${field}' NO debería viajar en la view y llegó con valor ${JSON.stringify(rec[field])}`
      )
    }
  }
})

test("el dueño sigue leyendo su fila completa en la tabla base", async () => {
  const owner = await createUser("Views Owner3")
  const ids = await seed(owner)

  const session = await getOneAs(owner, "sessions", ids.sessions)
  assert.equal(session?.hr_avg, 142, "el dueño debe seguir viendo su frecuencia cardiaca")
  assert.equal(session?.calories_actual, 430, "el dueño debe seguir viendo sus calorías del reloj")

  const cardio = await getOneAs(owner, "cardio_sessions", ids.cardio_sessions)
  assert.equal(cardio?.hr_max, 181, "el dueño debe seguir viendo su FC máxima de cardio")

  const settings = await getOneAs(owner, "settings", ids.settings)
  assert.equal(settings?.water_goal, 2500, "el dueño debe seguir viendo su objetivo de agua")

  const stats = await getOneAs(owner, "user_stats", ids.user_stats)
  assert.equal(stats?.total_nutrition_logs, 55, "el dueño debe seguir viendo sus contadores de nutrición")
})

test("las escrituras siguen yendo a la tabla base y la view las refleja", async () => {
  const owner = await createUser("Views Writer")
  const other = await createUser("Views Reader")

  // Alta hecha por el propio usuario (pasa por createRule real, no superuser).
  const created = await api("/api/collections/sessions/records", {
    method: "POST",
    token: await authAs(owner),
    body: {
      user: owner.id, workout_key: "wk-escritura", phase: 1, day: "day1",
      completed_at: "2026-07-22 10:00:00.000Z", hr_avg: 133,
    },
  })

  const seen = await getOneAs(other, "public_sessions", created.id)
  assert.equal(seen?.workout_key, "wk-escritura", "la view refleja el alta al momento")
  assert.equal(seen?.hr_avg, undefined, "y sigue sin traer la frecuencia cardiaca")
})

test("la view soporta orden, filtro por cursor y totalItems", async () => {
  // Las tres mecánicas de las que dependen el muro (paginación por cursor de
  // timestamp) y el leaderboard (getList(1,1) leyendo solo totalItems). Si una
  // view no las soportara, ambas pantallas se vaciarían sin dar error.
  const owner = await createUser("Views Sort")
  const reader = await createUser("Views Sort Reader")
  const stamps = [["1", "2026-07-21 10:00:00.000Z"], ["2", "2026-07-22 10:00:00.000Z"], ["3", "2026-07-20 10:00:00.000Z"]]
  for (const [n, ts] of stamps) {
    await create("sessions", { user: owner.id, workout_key: `wk${n}`, phase: 1, day: "d", completed_at: ts })
  }
  const token = await authAs(reader)
  const filter = encodeURIComponent(`user='${owner.id}'`)

  const sorted = await api(`/api/collections/public_sessions/records?perPage=10&sort=-completed_at&filter=${filter}`, { token })
  assert.deepEqual(
    sorted.items.map((i) => i.workout_key), ["wk2", "wk1", "wk3"],
    "sort descendente por completed_at sobre la view"
  )

  const page = await api(`/api/collections/public_sessions/records?perPage=1&filter=${filter}`, { token })
  assert.equal(page.totalItems, 3, "totalItems debe contar todas las filas, no solo la página")

  const cursor = await listAs(reader, "public_sessions", `user='${owner.id}' && completed_at < '2026-07-22 00:00:00.000Z'`)
  assert.equal(cursor.length, 2, "filtro por cursor de fecha sobre la view")
})

test("expand:user funciona sobre la view (el muro pinta nombre y avatar con él)", async () => {
  const owner = await createUser("Views Expand")
  const other = await createUser("Views Expand Reader")
  const ids = await seed(owner)

  const rec = await api(`/api/collections/public_sessions/records/${ids.sessions}?expand=user`, {
    token: await authAs(other),
  })
  assert.equal(rec.expand?.user?.id, owner.id, "expand=user debe resolver el perfil del dueño")
})

/**
 * `public_battle_finishes` (1784600000).
 *
 * `battles` y `battle_participants` son ilegibles para quien no jugó, y eso
 * protege también el MARCADOR EN VIVO. La view existe para que el muro pueda
 * enseñar el resultado sin relajar esas reglas, así que la promesa que hay que
 * fijar es exactamente esa: solo batallas ya cerradas, y sin el progreso del
 * participante.
 */
async function seedBattle(user, status) {
  const battle = await create("battles", {
    creator: user.id,
    status,
    // Config real de un preset: el hook `battle_api` valida `scoring_mode` y
    // exige al menos un ejercicio, así que un config de mentira da un 400.
    config: {
      workout_template_id: "battle_sprint_3",
      rounds: 3,
      scoring_mode: "rounds_then_reps_then_time",
      exercises: [
        { exercise_id: "push_ups", position: 0, target: { kind: "reps", value: 12 }, rest_seconds: 20 },
        { exercise_id: "jump_squats", position: 1, target: { kind: "reps", value: 15 }, rest_seconds: 20 },
        { exercise_id: "burpees", position: 2, target: { kind: "reps", value: 8 }, rest_seconds: 40 },
      ],
    },
    starts_at: "2026-08-13 20:00:00.000Z",
    ends_at: "2026-08-13 20:30:00.000Z",
    finished_at: status === "finished" ? "2026-08-13 20:12:00.000Z" : "",
    last_activity_at: "2026-08-13 20:12:00.000Z",
    final_standings: [
      { participant_id: "bp1", user: user.id, rank: 1, status: "active",
        score: { completed_reps: 36, completed_rounds: 3, completed_time_seconds: 0, finished_at: null, tie_break_key: "bp1" } },
    ],
  })
  const participant = await create("battle_participants", {
    battle: battle.id,
    user: user.id,
    status: "finished",
    joined_at: "2026-08-13 20:00:00.000Z",
    finished_at: "2026-08-13 20:12:00.000Z",
    progress: { secreto: "marcador en vivo" },
  })
  return { battle, participant }
}

test("public_battle_finishes publica el resultado sin abrir la batalla en vivo", async () => {
  const player = await createUser("Battle Player")
  const watcher = await createUser("Battle Watcher")

  const closed = await seedBattle(player, "finished")
  const live = await seedBattle(player, "live")

  // 1. La tabla base sigue cerrada para quien no jugó: si no, la view sobra.
  assert.equal(
    await getOneAs(watcher, "battles", closed.battle.id), null,
    "un tercero NO debe poder leer la fila de `battles`"
  )

  // 2. La batalla cerrada sí sale por la view, con lo que pinta la tarjeta.
  const rows = await listAs(watcher, "public_battle_finishes", `user = '${player.id}'`)
  assert.equal(rows.length, 1, `la view debe traer solo la batalla cerrada (trajo ${rows.length})`)
  assert.equal(rows[0].battle, closed.battle.id, "y debe ser la cerrada, no la que sigue viva")
  assert.ok(rows[0].battle_standings?.length, "el marcador congelado es lo que da el puesto")
  assert.equal(
    rows[0].battle_config?.workout_template_id, "battle_sprint_3",
    "el cliente resuelve el nombre del preset con esta clave"
  )

  // 3. Y NUNCA el progreso en vivo del participante.
  assert.equal(
    rows[0].progress, undefined,
    "`progress` es el marcador en vivo y no puede viajar en la view"
  )

  // 4. La batalla que sigue corriendo no aparece por ningún lado.
  assert.equal(
    await getOneAs(watcher, "public_battle_finishes", live.participant.id), null,
    "una batalla en curso no puede asomar por la view"
  )
})

test("challenge_participants tiene `created` para poder ordenar el muro", async () => {
  // Sin timestamp es imposible colocar "se apuntó a un reto" en un feed
  // cronológico; la colección no tenía NINGUNO hasta 1784600000.
  const user = await createUser("Challenge Joiner")
  const challenge = await create("challenges", {
    creator: user.id, title: "Reto de prueba", metric: "most_pushups",
    starts_at: "2026-08-20 00:00:00.000Z", ends_at: "2026-09-20 00:00:00.000Z", status: "active",
  })
  const row = await create("challenge_participants", { challenge: challenge.id, user: user.id })

  const seen = await getOneAs(user, "challenge_participants", row.id)
  assert.ok(seen?.created, "`created` debe rellenarse solo al crear la participación")
  assert.match(seen.created, /^\d{4}-\d{2}-\d{2}/, "y venir como fecha, no como cadena vacía")
})
