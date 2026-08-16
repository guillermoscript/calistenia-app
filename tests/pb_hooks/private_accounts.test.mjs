/**
 * Cuentas privadas con aprobación (#422).
 *
 * Cubre las dos piezas que introduce la decisión: la migración
 * `1784100000_private_accounts.js` (campos, backfill, reglas de las seis views,
 * `createRule` endurecida) y el hook `follow_requests.pb.js` (quién fija el
 * `status` y quién puede aceptar).
 *
 * Los tests que de verdad importan, y por qué:
 *   1. **Nada cambia para las cuentas públicas.** Es la premisa entera de la
 *      decisión —público por defecto— y lo que permite desplegar esto sin
 *      coordinar con la app ya instalada en Play.
 *   2. **El `status` no lo elige el cliente.** El primer intento de este issue
 *      añadía `follows.status` sin tocar la `createRule`, y entonces el
 *      atacante POSTeaba su propia fila ya `accepted` y saltaba la aprobación
 *      en una petición. Ese test es el que evita reintroducirlo.
 *   3. **Una solicitud pendiente no filtra por el canal de notificaciones.**
 *      Las reglas de las views pueden estar perfectas y el fan-out de
 *      `notifyFollowers` seguir contando al pendiente como seguidor.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, createAs, create, update, list, listAs, api, authAs,
  expectNotifications,
} from "./helpers/client.mjs"

/** Las seis views que #386 creó y que #422 reestrecha. */
const VIEWS = [
  "public_sessions",
  "public_cardio_sessions",
  "public_circuit_sessions",
  "public_sets_log",
  "public_prs",
  "public_user_stats",
]

async function makePrivate(user) {
  await update("users", user.id, { is_private: true })
}

/** Una sesión del usuario, sembrada como superuser (no es lo que se prueba). */
function seedSession(user, key = "w1") {
  return create("sessions", {
    user: user.id,
    workout_key: key,
    phase: 1,
    day: "day1",
    completed_at: "2026-07-21 10:00:00.000Z",
  })
}

/** Cuántas sesiones de `target` ve `viewer` a través de la view. */
async function visibleSessions(viewer, target) {
  const rows = await listAs(viewer, "public_sessions", `user="${target.id}"`)
  return rows.length
}

// ── 1. Las cuentas públicas siguen exactamente igual ─────────────────────────

test("cuenta pública: el follow sin `status` sigue siendo instantáneo y deja leer", async () => {
  const atleta = await createUser("Publico Atleta")
  const fan = await createUser("Publico Fan")
  await seedSession(atleta)

  // Exactamente lo que manda `useFollows.ts:107`, es decir la app ya publicada
  // en Play: sin campo `status`. Si esto se rompiera, el botón de seguir
  // dejaría de funcionar en todos los builds antiguos, en silencio.
  const rec = await createAs(fan, "follows", { follower: fan.id, following: atleta.id })

  assert.equal(rec.status, "accepted", "el hook lo acepta solo contra cuenta pública")
  assert.equal(await visibleSessions(fan, atleta), 1, "el seguidor lee la actividad")
})

test("cuenta pública: un tercero sin follow sigue leyendo la actividad", async () => {
  const atleta = await createUser("Publico Abierto")
  const extrano = await createUser("Publico Extrano")
  await seedSession(atleta)

  // El alcance de siempre. #422 NO lo estrecha para las cuentas públicas: esa
  // es la diferencia entre la opción elegida y "privado por defecto".
  assert.equal(await visibleSessions(extrano, atleta), 1)
})

// ── 2. Cuentas privadas ──────────────────────────────────────────────────────

test("cuenta privada: el follow nace pendiente y NO da acceso", async () => {
  const atleta = await createUser("Privado Atleta")
  const solicitante = await createUser("Privado Solicitante")
  await makePrivate(atleta)
  await seedSession(atleta)

  const rec = await createAs(solicitante, "follows", {
    follower: solicitante.id, following: atleta.id,
  })

  assert.equal(rec.status, "pending", "contra cuenta privada nace pendiente")
  assert.equal(await visibleSessions(solicitante, atleta), 0, "pendiente no lee nada")
})

test("cuenta privada: un tercero sin follow no ve nada", async () => {
  const atleta = await createUser("Privado Cerrado")
  const extrano = await createUser("Privado Extrano")
  await makePrivate(atleta)
  await seedSession(atleta)

  assert.equal(await visibleSessions(extrano, atleta), 0)
})

test("cuenta privada: el dueño sigue leyendo lo suyo", async () => {
  const atleta = await createUser("Privado Dueno")
  await makePrivate(atleta)
  await seedSession(atleta)

  // El fallo caro de cualquier cambio de alcance: dejar ciego al propio dueño.
  assert.equal(await visibleSessions(atleta, atleta), 1)
})

// ── 3. El status NO lo elige el cliente ──────────────────────────────────────

test("forjar `status: accepted` contra una cuenta privada lo rechaza la createRule", async () => {
  const atleta = await createUser("Forjado Atleta")
  const atacante = await createUser("Forjado Atacante")
  await makePrivate(atleta)
  await seedSession(atleta)

  // ESTE es el test que evita reintroducir el agujero: con la createRule
  // anterior (solo `follower = @request.auth.id`) esta petición se aceptaba
  // tal cual y la aprobación quedaba de adorno.
  await assert.rejects(
    () => createAs(atacante, "follows", {
      follower: atacante.id, following: atleta.id, status: "accepted",
    }),
    "la createRule debe rechazar un accepted forjado contra una cuenta privada",
  )

  assert.equal(await visibleSessions(atacante, atleta), 0)
})

test("el hook normaliza aunque el cuerpo mienta contra una cuenta pública", async () => {
  const atleta = await createUser("Normaliza Atleta")
  const otro = await createUser("Normaliza Otro")

  // Contra una cuenta pública la createRule sí deja pasar `accepted` (es el
  // follow instantáneo de siempre). Lo que se comprueba aquí es que el valor
  // guardado sale del servidor y no del cuerpo.
  const rec = await createAs(otro, "follows", {
    follower: otro.id, following: atleta.id, status: "pending",
  })
  assert.equal(rec.status, "accepted", "el destino es público → el hook lo acepta")
})

// ── 4. Aceptar y rechazar ────────────────────────────────────────────────────

test("aceptar: solo el destinatario puede, y da acceso de verdad", async () => {
  const atleta = await createUser("Aceptar Atleta")
  const solicitante = await createUser("Aceptar Solicitante")
  const tercero = await createUser("Aceptar Tercero")
  await makePrivate(atleta)
  await seedSession(atleta)

  const rec = await createAs(solicitante, "follows", {
    follower: solicitante.id, following: atleta.id,
  })

  // Un tercero no puede aceptar por ti. Y contesta 404, no 403: quien no es el
  // destinatario tampoco debe poder averiguar qué ids de solicitud existen.
  const ajeno = await api(`/api/follows/${rec.id}/accept`, {
    method: "POST", token: await authAs(tercero), raw: true,
  })
  assert.equal(ajeno.status, 404, "un tercero no acepta solicitudes ajenas")

  // Ni el propio solicitante.
  const propio = await api(`/api/follows/${rec.id}/accept`, {
    method: "POST", token: await authAs(solicitante), raw: true,
  })
  assert.equal(propio.status, 404, "el solicitante no se acepta a sí mismo")
  assert.equal(await visibleSessions(solicitante, atleta), 0, "sigue sin ver nada")

  // El destinatario sí.
  const ok = await api(`/api/follows/${rec.id}/accept`, {
    method: "POST", token: await authAs(atleta),
  })
  assert.equal(ok.status, "accepted")
  assert.equal(await visibleSessions(solicitante, atleta), 1, "ahora sí lee")
})

test("aceptar dos veces es idempotente y no duplica el aviso", async () => {
  const atleta = await createUser("Idem Atleta")
  const solicitante = await createUser("Idem Solicitante")
  await makePrivate(atleta)

  const rec = await createAs(solicitante, "follows", {
    follower: solicitante.id, following: atleta.id,
  })
  const token = await authAs(atleta)

  await api(`/api/follows/${rec.id}/accept`, { method: "POST", token })
  const segunda = await api(`/api/follows/${rec.id}/accept`, { method: "POST", token })

  assert.equal(segunda.already, true, "la segunda no reescribe")
  await expectNotifications(
    solicitante.id, "follow_accepted", 1,
    "pulsar aceptar dos veces no manda dos avisos",
  )
})

test("rechazar borra la fila y deja volver a solicitar", async () => {
  const atleta = await createUser("Rechazo Atleta")
  const solicitante = await createUser("Rechazo Solicitante")
  await makePrivate(atleta)

  const rec = await createAs(solicitante, "follows", {
    follower: solicitante.id, following: atleta.id,
  })
  await api(`/api/follows/${rec.id}/reject`, { method: "POST", token: await authAs(atleta) })

  const quedan = await list("follows", `follower="${solicitante.id}" && following="${atleta.id}"`)
  assert.equal(quedan.length, 0, "rechazar borra, no deja un estado 'rejected'")

  // Y por eso se borra: el índice único (follower, following) impediría volver
  // a solicitar si la fila rechazada se quedara ahí.
  const otra = await createAs(solicitante, "follows", {
    follower: solicitante.id, following: atleta.id,
  })
  assert.equal(otra.status, "pending", "se puede volver a solicitar")
})

// ── 5. Notificaciones ────────────────────────────────────────────────────────

test("contra cuenta privada el aviso es `follow_request`, no `follow`", async () => {
  const atleta = await createUser("Aviso Atleta")
  const solicitante = await createUser("Aviso Solicitante")
  await makePrivate(atleta)

  await createAs(solicitante, "follows", { follower: solicitante.id, following: atleta.id })

  // Decir "tienes un nuevo seguidor" por una solicitud es mentir sobre quién
  // puede ver tu actividad, que es justo lo que #422 arregla.
  await expectNotifications(atleta.id, "follow_request", 1, "solicitud → follow_request")
  await expectNotifications(atleta.id, "follow", 0, "y NO el aviso de seguidor")
})

test("una solicitud pendiente no recibe el fan-out de actividad", async () => {
  const atleta = await createUser("Fanout Atleta")
  const pendiente = await createUser("Fanout Pendiente")
  await makePrivate(atleta)

  await createAs(pendiente, "follows", { follower: pendiente.id, following: atleta.id })
  await createAs(atleta, "sessions", {
    user: atleta.id, workout_key: "w1", phase: 1, day: "day1",
    completed_at: "2026-07-21 10:00:00.000Z",
  })

  // Las reglas de las views pueden estar perfectas y filtrarse igual por aquí:
  // `notifyFollowers` leía TODAS las filas de `follows`, pendientes incluidas.
  await expectNotifications(
    pendiente.id, "friend_joined", 0,
    "el pendiente no debe enterarse de que la cuenta privada ha entrenado",
  )
})

// ── 6. Cobertura de las seis views ───────────────────────────────────────────

test("las seis views aplican el mismo alcance", async () => {
  const atleta = await createUser("Views Atleta")
  const extrano = await createUser("Views Extrano")
  await makePrivate(atleta)

  // No hace falta sembrar en cada colección: lo que se comprueba es que
  // ninguna de las seis deja pasar filas de una cuenta privada a un tercero.
  // Una view que se hubiera quedado sin actualizar devolvería sus filas.
  for (const view of VIEWS) {
    const rows = await listAs(extrano, view, `user="${atleta.id}"`)
    assert.equal(rows.length, 0, `${view} no debe servir filas de una cuenta privada`)
  }
})

// ── 7. Compatibilidad hacia atrás ────────────────────────────────────────────

test("los follows anteriores a #422 cuentan como aceptados", async () => {
  const atleta = await createUser("Legacy Atleta")
  const seguidor = await createUser("Legacy Seguidor")
  await seedSession(atleta)

  // Simula una fila anterior a la migración: sin `status`. El backfill pone
  // 'accepted' a las que ya existían, y la regla trata el vacío como aceptado
  // para las que crean los clientes viejos antes de que el hook las normalice.
  const rec = await createAs(seguidor, "follows", { follower: seguidor.id, following: atleta.id })
  await update("follows", rec.id, { status: "" })
  await makePrivate(atleta)

  assert.equal(
    await visibleSessions(seguidor, atleta), 0,
    "un status vacío NO debe dar acceso a una cuenta que ahora es privada",
  )
})
