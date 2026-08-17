/**
 * notification_service.pb.js — retos: join notifica al creador y
 * complete notifica a participantes + creador exactamente una vez.
 *
 * Al final, el cron `challenges_expiry` de `pb_hooks/challenges_expiry.pb.js`
 * (#515): quién se cierra solo en el servidor y quién no.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, createAs, update, expectNotifications,
  getOne, localDateString, triggerCron, waitFor, sleep,
} from "./helpers/client.mjs"

// Fechas relativas y en curso, no literales pasadas: desde #515 el cron
// `challenges_expiry` cierra cualquier reto `active` cuyo `ends_at` ya pasó, y un
// fixture con fecha fija se convertiría con el tiempo en un reto que el cron
// cierra a mitad de suite —notificando— si la pasada horaria cae dentro del run.
function makeChallenge(creator) {
  return createAs(creator, "challenges", {
    creator: creator.id,
    title: "Reto de dominadas",
    metric: "sessions",
    starts_at: localDateString(-3),
    ends_at: localDateString(7),
    status: "active",
  })
}

test("unirse a un reto notifica al creador (self-join sin challenge_invite)", async () => {
  const creator = await createUser("Creador Reto")
  const joiner = await createUser("Participante Uno")
  const challenge = await makeChallenge(creator)

  await createAs(joiner, "challenge_participants", { challenge: challenge.id, user: joiner.id })

  const [notif] = await expectNotifications(creator.id, "challenge_join", 1, "join → notif al creador")
  assert.equal(notif.actor, joiner.id)
  assert.equal(notif.data.userName, "Participante Uno")
  assert.equal(notif.data.challengeTitle, "Reto de dominadas")

  // Self-join: el que se une no recibe invitación
  await expectNotifications(joiner.id, "challenge_invite", 0, "self-join sin challenge_invite")
})

test("no se puede crear participación para otro: la API rule bloquea invitaciones (#261)", async () => {
  const inviter = await createUser("Invitador Reto")
  const invited = await createUser("Invitado Reto")
  const challenge = await makeChallenge(inviter)

  // @request.body.user = @request.auth.id → crear participación para otro falla,
  // por eso challenge_invite se eliminó como tipo de notificación (#261).
  await assert.rejects(
    createAs(inviter, "challenge_participants", { challenge: challenge.id, user: invited.id }),
    (err) => err.status === 400 || err.status === 403,
    "crear participación para otro debe rechazarse por API rule"
  )

  await expectNotifications(invited.id, "challenge_invite", 0, "sin notif de invitación")
})

test("el propio creador uniéndose no se auto-notifica", async () => {
  const creator = await createUser("Creador Solo")
  const challenge = await makeChallenge(creator)

  await createAs(creator, "challenge_participants", { challenge: challenge.id, user: creator.id })
  await expectNotifications(creator.id, "challenge_join", 0, "creador no se notifica a sí mismo")
})

test("terminar un reto ('ended') notifica a participantes y creador una sola vez (#312)", async () => {
  const creator = await createUser("Creador Complete")
  const p1 = await createUser("Part Uno")
  const p2 = await createUser("Part Dos")
  const challenge = await makeChallenge(creator)

  await createAs(p1, "challenge_participants", { challenge: challenge.id, user: p1.id })
  await createAs(p2, "challenge_participants", { challenge: challenge.id, user: p2.id })

  // 'ended' es lo que escribe el cliente (useChallenges) y el valor del dominio
  await update("challenges", challenge.id, { status: "ended" })

  for (const u of [p1, p2, creator]) {
    const [notif] = await expectNotifications(u.id, "challenge_complete", 1, `challenge_complete para ${u.name}`)
    assert.equal(notif.data.challengeTitle, "Reto de dominadas")
  }

  // Un update posterior sin transición de estado no re-notifica
  await update("challenges", challenge.id, { title: "Reto de dominadas (final)" })
  await expectNotifications(creator.id, "challenge_complete", 1, "sin re-notificación al editar terminado")
})

test("normalizar una fila legacy 'completed' a 'ended' no notifica (#312)", async () => {
  const creator = await createUser("Creador Legacy")
  const p1 = await createUser("Part Legacy")
  const challenge = await createAs(creator, "challenges", {
    creator: creator.id,
    title: "Reto legacy",
    metric: "sessions",
    starts_at: "2026-07-20",
    ends_at: "2026-07-27",
    status: "completed",
  })
  await createAs(p1, "challenge_participants", { challenge: challenge.id, user: p1.id })

  await update("challenges", challenge.id, { status: "ended" })

  await expectNotifications(p1.id, "challenge_complete", 0, "fila legacy ya estaba terminada")
  await expectNotifications(creator.id, "challenge_complete", 0, "fila legacy ya estaba terminada (creador)")
})

// ── Cron de caducidad (#515) ─────────────────────────────────────────────────

test("challenges_expiry cierra en el servidor un reto caducado y notifica", async () => {
  const creator = await createUser("Creador Caducado")
  const participant = await createUser("Part Caducado")
  const challenge = await createAs(creator, "challenges", {
    creator: creator.id,
    title: "Reto caducado",
    metric: "sessions",
    starts_at: localDateString(-20),
    ends_at: localDateString(-10),
    status: "active",
  })
  await createAs(participant, "challenge_participants", { challenge: challenge.id, user: participant.id })

  await triggerCron("challenges_expiry")

  // El punto entero del issue: la fila cambia sin que ningún cliente escriba y,
  // en particular, sin que el creador llegue a abrir la app.
  await waitFor(async () => {
    const row = await getOne("challenges", challenge.id)
    return row.status === "ended" ? row : null
  }, "el cron deja el reto caducado en 'ended'")

  // El cierre por cron SÍ debe notificar: es el camino normal de aquí en
  // adelante. El que no debe notificar es el backlog histórico, y ese lo limpia
  // la migración con SQL crudo (manual/verify-expired-backlog.mjs).
  await expectNotifications(participant.id, "challenge_complete", 1, "el cierre por cron notifica al participante")
  await expectNotifications(creator.id, "challenge_complete", 1, "el cierre por cron notifica al creador")
})

test("challenges_expiry no toca un reto que acaba hoy ni uno futuro", async () => {
  const creator = await createUser("Creador Vigente")
  const endsToday = await createAs(creator, "challenges", {
    creator: creator.id,
    title: "Reto que acaba hoy",
    metric: "sessions",
    starts_at: localDateString(-3),
    ends_at: localDateString(0),
    status: "active",
  })
  const endsLater = await createAs(creator, "challenges", {
    creator: creator.id,
    title: "Reto futuro",
    metric: "sessions",
    starts_at: localDateString(0),
    ends_at: localDateString(10),
    status: "active",
  })

  await triggerCron("challenges_expiry")
  await sleep(500)

  // El corte del cron espera a que el día haya terminado en TODAS las zonas
  // horarias (12 h de margen), así que el reto de hoy no puede cerrarse hoy:
  // hacerlo dejaría a un usuario en UTC-12 con el reto cerrado a media mañana.
  assert.equal((await getOne("challenges", endsToday.id)).status, "active", "el reto que acaba hoy sigue activo")
  assert.equal((await getOne("challenges", endsLater.id)).status, "active", "el reto futuro sigue activo")
  await expectNotifications(creator.id, "challenge_complete", 0, "sin notificaciones por retos vigentes")
})
