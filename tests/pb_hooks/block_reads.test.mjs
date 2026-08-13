/**
 * Enforcement de LECTURA del bloqueo (#386).
 *
 * `blocks.test.mjs` cubre los efectos del bloqueo (unfollow, espejo, notifs) y
 * los guards de ESCRITURA (400 al interactuar). Lo que no estaba cubierto —y es
 * lo que #386 destapó— es la lectura: que una persona bloqueada no pueda leer
 * los datos de quien la bloqueó.
 *
 * El test es simétrico a propósito: el bloqueo esconde en AMBAS direcciones
 * (quien bloquea tampoco ve al bloqueado), que es lo que expresan las dos
 * cláusulas de la regla.
 *
 * Importante: se lee con `listAs`/`getOneAs` (token del usuario) y NO con
 * `list`/`getOne` (superuser), porque el superuser bypassa las API rules y el
 * test pasaría siempre.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, createAs, create, list, listAs, getOneAs, waitFor, getOne,
} from "./helpers/client.mjs"

/** Colecciones con datos de usuario legibles entre usuarios y su campo dueño. */
const OWNER_FIELD = {
  sessions: "user",
  cardio_sessions: "user",
  circuit_sessions: "user",
  sets_log: "user",
  settings: "user",
  user_stats: "user",
  race_participants: "user",
  user_programs: "user",
  challenges: "creator",
  challenge_participants: "user",
}

/**
 * Superficie por la que una persona ajena lee cada colección. Desde
 * 1783500000_public_read_views.js las seis primeras son owner-only y su lectura
 * cruzada pasa por una view `public_*`; el resto se lee de la tabla base.
 *
 * Los tests siembran SIEMPRE en la tabla base (es donde se escribe) y comprueban
 * el bloqueo sobre esta superficie, que es la que ve la app.
 */
const READ_SURFACE = {
  sessions: "public_sessions",
  cardio_sessions: "public_cardio_sessions",
  circuit_sessions: "public_circuit_sessions",
  sets_log: "public_sets_log",
  settings: "public_prs",
  user_stats: "public_user_stats",
}

const surfaceOf = (collection) => READ_SURFACE[collection] || collection

/** Siembra una fila de cada colección para `user`. Devuelve {colección: id}. */
async function seedFor(user) {
  const ids = {}

  const session = await create("sessions", {
    user: user.id, workout_key: "wk", phase: 1, day: "day1",
    completed_at: "2026-07-21 10:00:00.000Z",
  })
  ids.sessions = session.id

  ids.cardio_sessions = (await create("cardio_sessions", {
    user: user.id, activity_type: "run", distance_km: 5, duration_seconds: 1800,
    started_at: "2026-07-21 09:00:00", finished_at: "2026-07-21 09:30:00",
    hr_avg: 150, hr_max: 175, note: "dato de salud",
  })).id

  ids.circuit_sessions = (await create("circuit_sessions", {
    user: user.id, mode: "amrap", started_at: "2026-07-21 08:00:00",
  })).id

  ids.sets_log = (await create("sets_log", {
    user: user.id, exercise_id: "pushup", workout_key: "wk",
    logged_at: "2026-07-21 10:00:00.000Z", reps: "10", weight_kg: 20, rpe: 8,
    note: "nota privada de la serie",
  })).id

  ids.settings = (await create("settings", {
    user: user.id, phase: 1, weekly_goal: 4, water_goal: 2000,
    pr_pullups: 12, pr_pushups: 40,
  })).id

  // user_stats puede existir ya (lo crean hooks); reutilizamos si está.
  const stats = await list("user_stats", `user = '${user.id}'`)
  ids.user_stats = stats.length
    ? stats[0].id
    : (await create("user_stats", { user: user.id, xp: 100, level: 2, total_sessions: 5 })).id

  const program = await create("programs", { name: "Programa test", slug: `p-${user.id}` })
  ids.user_programs = (await create("user_programs", {
    user: user.id, program: program.id, is_current: true, status: "active",
  })).id

  // Carrera NO pública: la pública sigue siendo legible por diseño (landing/OG).
  const race = await create("races", {
    creator: user.id, name: "Carrera privada", status: "active", is_public: false,
    origin_lat: 40.4, origin_lng: -3.7,
  })
  ids.races = race.id
  ids.race_participants = (await create("race_participants", {
    race: race.id, user: user.id, display_name: user.name, status: "running",
    // Sin `gps_track`: el recorrido salió a `race_routes` con #316. Lo que aquí
    // se comprueba es que el bloqueo esconde la participación (posición en vivo
    // incluida); el recorrido lo cubre race_routes.test.mjs.
    last_lat: 40.41, last_lng: -3.71, distance_km: 2,
  })).id

  const challenge = await create("challenges", {
    creator: user.id, title: "Reto de lectura", metric: "sessions",
    starts_at: "2026-07-20", ends_at: "2026-07-27", status: "active",
  })
  ids.challenges = challenge.id
  ids.challenge_participants = (await create("challenge_participants", {
    challenge: challenge.id, user: user.id,
  })).id

  return ids
}

/** Assert: `reader` NO ve ninguna fila de `owner` en ninguna colección. */
async function assertHidden(reader, owner, ids, label) {
  for (const [collection, ownerField] of Object.entries(OWNER_FIELD)) {
    const surface = surfaceOf(collection)
    const rows = await listAs(reader, surface, `${ownerField} = '${owner.id}'`)
    assert.equal(
      rows.length, 0,
      `${label}: ${surface} debería estar oculta y devolvió ${rows.length} fila(s)`
    )
    const one = await getOneAs(reader, surface, ids[collection])
    assert.equal(
      one, null,
      `${label}: getOne de ${surface} debería dar 404 y devolvió el registro`
    )
  }

  // `races` no pública: mismo trato, pero su dueño es `creator`.
  const races = await listAs(reader, "races", `creator = '${owner.id}'`)
  assert.equal(races.length, 0, `${label}: races privada visible (${races.length})`)
  assert.equal(await getOneAs(reader, "races", ids.races), null, `${label}: getOne de races`)

  // El propio perfil: sin esto el bloqueo queda a medias (nombre, avatar,
  // nivel… y aparecer en el buscador de amigos).
  const profiles = await listAs(reader, "users", `id = '${owner.id}'`)
  assert.equal(profiles.length, 0, `${label}: el perfil sigue apareciendo en users`)
  assert.equal(await getOneAs(reader, "users", owner.id), null, `${label}: getOne de users`)

  // Y aun así cada uno se ve a sí mismo (si esto fallara, no arranca la app).
  const self = await getOneAs(reader, "users", reader.id)
  assert.ok(self, `${label}: el usuario debe poder leer su propia fila`)
}

test("antes de bloquear, B sí ve los datos de A (el test detectaría una regresión)", async () => {
  const a = await createUser("Read A")
  const b = await createUser("Read B")
  const ids = await seedFor(a)

  // Sanity check: sin bloqueo estas superficies son legibles entre usuarios.
  // Si esto fallara, el assert de "oculto" de abajo pasaría por el motivo
  // equivocado y el test no probaría nada.
  const sessions = await listAs(b, "public_sessions", `user = '${a.id}'`)
  assert.ok(sessions.length > 0, "sin bloqueo B ve las sesiones de A")

  const setsLog = await listAs(b, "public_sets_log", `user = '${a.id}'`)
  assert.ok(setsLog.length > 0, "sin bloqueo B ve el sets_log de A")

  const prs = await listAs(b, "public_prs", `user = '${a.id}'`)
  assert.ok(prs.length > 0, "sin bloqueo B ve los PRs de A")

  assert.ok(await getOneAs(b, "public_sessions", ids.sessions), "sin bloqueo B abre la sesión de A")
})

test("tras bloquear, el bloqueado no lee NADA del que bloquea", async () => {
  const a = await createUser("Block A")
  const b = await createUser("Block B")
  const ids = await seedFor(a)

  await createAs(a, "user_blocks", { blocker: a.id, blocked: b.id })
  await waitFor(async () => {
    const rec = await getOne("users", a.id)
    return rec.blocked_users.includes(b.id)
  }, "espejo blocked_users poblado")

  await assertHidden(b, a, ids, "B bloqueado por A")
})

test("el bloqueo esconde en ambas direcciones: quien bloquea tampoco ve al bloqueado", async () => {
  const a = await createUser("Mutual A")
  const b = await createUser("Mutual B")
  const ids = await seedFor(b)

  await createAs(a, "user_blocks", { blocker: a.id, blocked: b.id })
  await waitFor(async () => {
    const rec = await getOne("users", a.id)
    return rec.blocked_users.includes(b.id)
  }, "espejo blocked_users poblado")

  await assertHidden(a, b, ids, "A que bloqueó a B")
})

test("un tercero sin relación de bloqueo sigue viendo lo de siempre", async () => {
  const a = await createUser("Third A")
  const b = await createUser("Third B")
  const c = await createUser("Third C")
  const ids = await seedFor(a)

  await createAs(a, "user_blocks", { blocker: a.id, blocked: b.id })
  await waitFor(async () => {
    const rec = await getOne("users", a.id)
    return rec.blocked_users.includes(b.id)
  }, "espejo blocked_users poblado")

  // El bloqueo A→B no debe afectar a C. Es el caso que rompería si la cláusula
  // se escribiera con `?=` (any-match) en vez de `!=` (all-match).
  const sessions = await listAs(c, "public_sessions", `user = '${a.id}'`)
  assert.ok(sessions.length > 0, "C sigue viendo las sesiones de A")
  assert.ok(await getOneAs(c, "public_sessions", ids.sessions), "C sigue abriendo la sesión de A")

  const setsLog = await listAs(c, "public_sets_log", `user = '${a.id}'`)
  assert.ok(setsLog.length > 0, "C sigue viendo el sets_log de A")
})

test("la carrera pública sigue siendo legible aunque haya bloqueo", async () => {
  const a = await createUser("Public race A")
  const b = await createUser("Public race B")

  const race = await create("races", {
    creator: a.id, name: "Carrera pública", status: "active", is_public: true,
  })

  await createAs(a, "user_blocks", { blocker: a.id, blocked: b.id })
  await waitFor(async () => {
    const rec = await getOne("users", a.id)
    return rec.blocked_users.includes(b.id)
  }, "espejo blocked_users poblado")

  // Decisión explícita: `is_public = true` se conserva para la landing de la
  // carrera y las OG tags, que se sirven sin sesión. El bloqueo no puede
  // esconder algo que ya es visible para cualquier invitado.
  assert.ok(
    await getOneAs(b, "races", race.id),
    "la carrera pública sigue visible (documentado, no un fallo del bloqueo)"
  )
})
