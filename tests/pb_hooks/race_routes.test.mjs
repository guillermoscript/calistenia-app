/**
 * Reglas de `race_routes` y lo que queda de `race_participants` (#316).
 *
 * Van contra un PocketBase real con las migraciones del repo, así que
 * comprueban la REGLA DE SERVIDOR, no la convención del cliente — que es justo
 * la distinción que dejó el agujero abierto: ninguna pantalla dibujaba el
 * recorrido de otra persona, pero el servidor tampoco lo impedía. Aquí, además,
 * ni siquiera hacía falta pedirlo: `finishParticipant` escribía la traza en el
 * mismo `update` que se difunde por realtime a toda la carrera.
 *
 * OJO: las lecturas van con `listAs`/`getOneAs`, nunca con los helpers `list`/
 * `getOne`, que usan superusuario y se saltan las reglas. Un test de privacidad
 * escrito con esos pasa siempre y no comprueba nada.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, create, createAs, update, remove, list, listAs, getOneAs, api, authAs, superToken,
} from "./helpers/client.mjs"

/** Puntos de carrera: `t` es relativo al inicio, no un timestamp absoluto. */
const TRACK = [
  { lat: 40.4168, lng: -3.7038, t: 0 },
  { lat: 40.4170, lng: -3.7040, t: 5000 },
]

/**
 * Carrera en `waiting`: es el único estado en el que `race_participants`
 * permite crear una participación (createRule de 1776000002:49, anti-trampas).
 */
async function makeRace(creator) {
  return create("races", {
    creator: creator.id,
    name: "Carrera de prueba",
    mode: "distance",
    target_distance_km: 5,
    status: "waiting",
    activity_type: "running",
    starts_at: "2026-08-12 08:00:00.000Z",
  })
}

/** Participación creada POR el propio usuario, pasando por su createRule. */
async function join(user, race, over = {}) {
  return createAs(user, "race_participants", {
    race: race.id,
    user: user.id,
    display_name: user.name,
    status: "finished",
    distance_km: 5,
    duration_seconds: 1800,
    avg_pace: 6,
    last_lat: 40.417,
    last_lng: -3.704,
    ...over,
  })
}

/** Carrera + participación de `user`. `organizer` la crea si se pasa. */
async function makeParticipant(user, organizer) {
  const race = await makeRace(organizer ?? user)
  const participant = await join(user, race)
  return { race, participant }
}

test("race_participants ya no tiene campo gps_track: la traza no puede colarse en el registro que todos leen", async () => {
  const owner = await createUser("Duena Carrera")
  const { race } = await makeParticipant(owner)

  // Se manda a propósito, que es exactamente lo que hace una app de Play
  // anterior a este cambio: PocketBase ignora en silencio las claves que no son
  // campos de la colección, así que NO da error y el resto del update sí entra.
  const otra = await createUser("Companera Carrera")
  const created = await join(otra, race, { display_name: "Otra participacion", distance_km: 3, gps_track: TRACK })

  assert.equal(created.gps_track, undefined, "el create no debe devolver gps_track")
  assert.equal(created.distance_km, 3, "y el resto del cuerpo sí se guarda: la app vieja no se rompe")

  // Y tampoco queda guardado por detrás (lectura como superuser, sin reglas).
  const raw = await api(`/api/collections/race_participants/records/${created.id}`, {
    token: await superToken(),
  })
  assert.equal(raw.gps_track, undefined, "el campo no existe en la colección")
})

test("una app antigua que manda gps_track en el update de fin de carrera no recibe error", async () => {
  // El caso concreto de la app instalada: `finishParticipant` mandaba el update
  // con `gps_track` dentro. Si PocketBase respondiera 400, la carrera no se
  // podría terminar desde una versión antigua — eso sí sería romperla.
  const owner = await createUser("Corredora Vieja")
  const { race, participant } = await makeParticipant(owner)
  // La updateRule solo deja escribir con la carrera en marcha (1776000002:50).
  await update("races", race.id, { status: "active" })

  const res = await api(`/api/collections/race_participants/records/${participant.id}`, {
    method: "PATCH",
    token: await authAs(owner),
    body: { status: "finished", distance_km: 5.2, gps_track: TRACK },
    raw: true,
  })
  assert.equal(res.status, 200, "el update con un campo inexistente debe seguir pasando")
  const body = await res.json()
  assert.equal(body.distance_km, 5.2, "la parte válida del update se guarda")
  assert.equal(body.gps_track, undefined, "la traza simplemente se evapora")
})

test("el recorrido es legible por su dueño y NO por otra cuenta autenticada", async () => {
  const owner = await createUser("Duena Recorrido")
  const fisgon = await createUser("Fisgon Carrera")
  const { participant } = await makeParticipant(owner)

  const route = await createAs(owner, "race_routes", {
    participant: participant.id,
    user: owner.id,
    points: TRACK,
  })

  // El dueño lo lee entero.
  const mine = await listAs(owner, "race_routes", `participant = '${participant.id}'`)
  assert.equal(mine.length, 1, "el dueño lista su recorrido")
  assert.equal(mine[0].points.length, 2, "con sus puntos")

  // Otra cuenta no lo lista...
  const theirs = await listAs(fisgon, "race_routes", `participant = '${participant.id}'`)
  assert.equal(theirs.length, 0, "otra cuenta no lista el recorrido ajeno")

  // ...ni lo alcanza por id directo.
  const one = await getOneAs(fisgon, "race_routes", route.id)
  assert.equal(one, null, "view por id de un recorrido ajeno devuelve 404")
})

test("la carrera en vivo NO se rompe: los demás siguen viendo posición y progreso", async () => {
  // La contrapartida del test anterior, y la razón de no haber usado el patrón
  // de views de #386: `race_participants` tiene que seguir abierta para que
  // cada corredor vea al resto avanzar.
  const owner = await createUser("Corredora Visible")
  const rival = await createUser("Rival")
  const { participant } = await makeParticipant(owner)

  const seen = await getOneAs(rival, "race_participants", participant.id)
  assert.ok(seen, "un rival debe seguir leyendo la participación ajena")
  assert.equal(seen.last_lat, 40.417, "y su posición en vivo, que es parte de la función")
  assert.equal(seen.distance_km, 5, "y su progreso")
  assert.equal(seen.gps_track, undefined, "pero ya sin el recorrido dentro")
})

test("nadie puede crear un recorrido a nombre de otra cuenta", async () => {
  const owner = await createUser("Duena Ajena Carrera")
  const atacante = await createUser("Atacante Carrera")
  const { participant } = await makeParticipant(owner)

  const res = await api("/api/collections/race_routes/records", {
    method: "POST",
    token: await authAs(atacante),
    body: { participant: participant.id, user: owner.id, points: TRACK },
    raw: true,
  })
  assert.equal(res.status, 400, "createRule exige que el user del body sea el propio")
})

test("borrar la participación se lleva su recorrido por delante", async () => {
  const owner = await createUser("Duena Borrado Carrera")
  const { participant } = await makeParticipant(owner)
  await createAs(owner, "race_routes", {
    participant: participant.id, user: owner.id, points: TRACK,
  })

  await remove("race_participants", participant.id)

  const left = await list("race_routes", `participant = '${participant.id}'`)
  assert.equal(left.length, 0, "cascadeDelete por `participant`")
})

test("borrar la cuenta se lleva sus recorridos de carrera", async () => {
  const owner = await createUser("Duena Baja Carrera")
  // La carrera la crea OTRA cuenta a propósito: `races.creator` sigue siendo una
  // relación required sin cascade y bloquearía el borrado de su creador. Eso es
  // territorio de #300, no de #316.
  const organizador = await createUser("Organizador Carrera")
  const { participant } = await makeParticipant(owner, organizador)
  const route = await createAs(owner, "race_routes", {
    participant: participant.id, user: owner.id, points: TRACK,
  })

  await remove("users", owner.id)

  assert.equal((await list("race_routes", `id = '${route.id}'`)).length, 0, "recorrido borrado")
  assert.equal((await list("race_participants", `id = '${participant.id}'`)).length, 0, "participación borrada")
})
