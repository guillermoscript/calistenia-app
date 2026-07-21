/**
 * notification_service.pb.js — retos: join notifica al creador y
 * complete notifica a participantes + creador exactamente una vez.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, createAs, update, expectNotifications,
} from "./helpers/client.mjs"

function makeChallenge(creator) {
  return createAs(creator, "challenges", {
    creator: creator.id,
    title: "Reto de dominadas",
    metric: "sessions",
    starts_at: "2026-07-20",
    ends_at: "2026-07-27",
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

test("el propio creador uniéndose no se auto-notifica", async () => {
  const creator = await createUser("Creador Solo")
  const challenge = await makeChallenge(creator)

  await createAs(creator, "challenge_participants", { challenge: challenge.id, user: creator.id })
  await expectNotifications(creator.id, "challenge_join", 0, "creador no se notifica a sí mismo")
})

test("completar un reto notifica a participantes y creador una sola vez", async () => {
  const creator = await createUser("Creador Complete")
  const p1 = await createUser("Part Uno")
  const p2 = await createUser("Part Dos")
  const challenge = await makeChallenge(creator)

  await createAs(p1, "challenge_participants", { challenge: challenge.id, user: p1.id })
  await createAs(p2, "challenge_participants", { challenge: challenge.id, user: p2.id })

  await update("challenges", challenge.id, { status: "completed" })

  for (const u of [p1, p2, creator]) {
    const [notif] = await expectNotifications(u.id, "challenge_complete", 1, `challenge_complete para ${u.name}`)
    assert.equal(notif.data.challengeTitle, "Reto de dominadas")
  }

  // Un update posterior sin transición de estado no re-notifica
  await update("challenges", challenge.id, { title: "Reto de dominadas (final)" })
  await expectNotifications(creator.id, "challenge_complete", 1, "sin re-notificación al editar completado")
})
