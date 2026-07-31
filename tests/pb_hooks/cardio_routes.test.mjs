/**
 * Reglas de `cardio_routes` y borrado en cascada de cardio/carreras (#299).
 *
 * Estos tests van contra un PocketBase real con las migraciones del repo, así
 * que comprueban la regla de servidor, no la convención del cliente — que es
 * justo la distinción que se le escapó a #299 en su día: la app nunca pedía
 * `gps_points` de otra persona, pero el servidor tampoco lo impedía.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { createUser, createAs, create, remove, list, api, authAs, superToken } from "./helpers/client.mjs"

const POINTS = [
  { lat: 40.4168, lng: -3.7038, timestamp: 1, alt: 660 },
  { lat: 40.4170, lng: -3.7040, timestamp: 2, alt: 662 },
]

/** Lista una colección con el token de `user` (pasa por las API rules). */
async function listAs(user, collection, filter) {
  const qs = filter ? `?perPage=200&filter=${encodeURIComponent(filter)}` : "?perPage=200"
  const res = await api(`/api/collections/${collection}/records${qs}`, { token: await authAs(user) })
  return res.items
}

async function makeCardio(user, note = "carrera") {
  return createAs(user, "cardio_sessions", {
    user: user.id,
    activity_type: "running",
    distance_km: 5,
    duration_seconds: 1800,
    note,
    started_at: "2026-07-25 08:00:00.000Z",
    finished_at: "2026-07-25 08:30:00.000Z",
  })
}

test("cardio_sessions ya no tiene campo gps_points: la ruta no puede colarse en el registro público", async () => {
  const owner = await createUser("Duena Ruta")
  const session = await createAs(owner, "cardio_sessions", {
    user: owner.id,
    activity_type: "running",
    distance_km: 5,
    duration_seconds: 1800,
    started_at: "2026-07-25 08:00:00.000Z",
    finished_at: "2026-07-25 08:30:00.000Z",
    // Se manda a propósito: PocketBase ignora las claves que no son campos.
    gps_points: POINTS,
  })

  assert.equal(session.gps_points, undefined, "el create no debe devolver gps_points")

  // Y tampoco queda guardado por detrás (lectura como superuser, sin reglas).
  const raw = await api(`/api/collections/cardio_sessions/records/${session.id}`, {
    token: await superToken(),
  })
  assert.equal(raw.gps_points, undefined, "el campo no existe en la colección")
})

test("la ruta es legible por su dueño y NO por otra cuenta autenticada", async () => {
  const owner = await createUser("Duena Privada")
  const fisgon = await createUser("Fisgon")
  const session = await makeCardio(owner)

  const route = await createAs(owner, "cardio_routes", {
    session: session.id,
    user: owner.id,
    points: POINTS,
  })

  // El dueño la lee entera.
  const mine = await listAs(owner, "cardio_routes", `session = '${session.id}'`)
  assert.equal(mine.length, 1, "el dueño lista su ruta")
  assert.equal(mine[0].points.length, 2, "con sus puntos")

  // Otra cuenta no la lista...
  const theirs = await listAs(fisgon, "cardio_routes", `session = '${session.id}'`)
  assert.equal(theirs.length, 0, "otra cuenta no lista la ruta ajena")

  // ...ni la alcanza por id directo.
  const res = await api(`/api/collections/cardio_routes/records/${route.id}`, {
    token: await authAs(fisgon),
    raw: true,
  })
  assert.equal(res.status, 404, "view por id de una ruta ajena devuelve 404")

  // Pero la sesión en sí sigue siendo visible: el muro no se rompe.
  const feed = await api(`/api/collections/cardio_sessions/records/${session.id}`, {
    token: await authAs(fisgon),
  })
  assert.equal(feed.id, session.id, "la sesión ajena sigue siendo legible para el muro")
  assert.equal(feed.gps_points, undefined, "pero ya sin ruta dentro")
})

test("nadie puede crear una ruta a nombre de otra cuenta", async () => {
  const owner = await createUser("Duena Ajena")
  const atacante = await createUser("Atacante")
  const session = await makeCardio(owner)

  const res = await api("/api/collections/cardio_routes/records", {
    method: "POST",
    token: await authAs(atacante),
    body: { session: session.id, user: owner.id, points: POINTS },
    raw: true,
  })
  assert.equal(res.status, 400, "createRule exige que el user del body sea el propio")
})

test("borrar la sesión se lleva su ruta por delante", async () => {
  const owner = await createUser("Duena Borrado")
  const session = await makeCardio(owner)
  await createAs(owner, "cardio_routes", { session: session.id, user: owner.id, points: POINTS })

  await remove("cardio_sessions", session.id)

  const left = await list("cardio_routes", `session = '${session.id}'`)
  assert.equal(left.length, 0, "cascadeDelete por `session`")
})

test("borrar la cuenta se lleva sesiones de cardio, rutas y participaciones en carreras", async () => {
  const owner = await createUser("Duena Baja")
  const session = await makeCardio(owner, "la que se borra con la cuenta")
  await createAs(owner, "cardio_routes", { session: session.id, user: owner.id, points: POINTS })

  // La carrera la crea OTRA cuenta a propósito: `races.creator` sigue siendo
  // una relación required sin cascade y bloquearía el borrado de su creador.
  // Eso es territorio de #300 (borrado de cuenta autoservicio), no de #299;
  // aquí solo se comprueba que cardio y participaciones ya no lo bloquean.
  const organizador = await createUser("Organizador")
  const race = await create("races", {
    creator: organizador.id,
    name: "Carrera de prueba",
    mode: "distance",
    target_distance_km: 5,
    status: "waiting",
    starts_at: "2026-07-25 08:00:00.000Z",
    activity_type: "running",
  })
  const part = await create("race_participants", {
    race: race.id,
    user: owner.id,
    display_name: owner.name,
    status: "joined",
  })

  await remove("users", owner.id)

  assert.equal((await list("cardio_sessions", `id = '${session.id}'`)).length, 0, "sesión de cardio borrada")
  assert.equal((await list("cardio_routes", `session = '${session.id}'`)).length, 0, "ruta borrada")
  assert.equal((await list("race_participants", `id = '${part.id}'`)).length, 0, "participación borrada")
})
