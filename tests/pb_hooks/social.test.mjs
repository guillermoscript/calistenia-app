/**
 * notification_service.pb.js — notificaciones sociales básicas:
 * follow, reacciones (sessions + fallback cardio + self-guard),
 * comentarios (owner, reply, dedup owner==parent-author) y
 * reacciones a comentarios.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, createAs, waitForPush, expectNotifications, resetPushes,
} from "./helpers/client.mjs"

function makeSession(user) {
  return createAs(user, "sessions", {
    user: user.id,
    workout_key: "test_workout",
    phase: 1,
    day: "day1",
    completed_at: "2026-07-21 10:00:00.000Z",
  })
}

test("follow notifica al seguido con push", async () => {
  await resetPushes()
  const a = await createUser("Ana Follower")
  const b = await createUser("Beto Seguido")

  await createAs(a, "follows", { follower: a.id, following: b.id })

  const [notif] = await expectNotifications(b.id, "follow", 1, "follow → notif al seguido")
  assert.equal(notif.actor, a.id)
  assert.equal(notif.data.followerName, "Ana Follower")

  const push = await waitForPush(
    (p) => p.path === "/api/send-push" && p.body?.user_id === b.id,
    "push de follow"
  )
  assert.match(push.body.title, /Ana Follower te sigue/)
  assert.equal(push.body.url, `/u/${a.id}`)
})

test("reacción a sesión notifica al dueño; auto-reacción no", async () => {
  const owner = await createUser("Dueno Sesion")
  const reactor = await createUser("Reactor Uno")
  const session = await makeSession(owner)

  // Auto-reacción: no debe notificar
  await createAs(owner, "feed_reactions", { session_id: session.id, reactor: owner.id, emoji: "💪" })
  await expectNotifications(owner.id, "reaction", 0, "self-reaction no notifica")

  await createAs(reactor, "feed_reactions", { session_id: session.id, reactor: reactor.id, emoji: "🔥" })
  const [notif] = await expectNotifications(owner.id, "reaction", 1, "reacción de otro sí notifica")
  assert.equal(notif.actor, reactor.id)
  assert.equal(notif.data.emoji, "🔥")
  assert.equal(notif.reference_id, session.id)
})

test("reacción a cardio_session usa el fallback de colección", async () => {
  const owner = await createUser("Dueno Cardio")
  const reactor = await createUser("Reactor Cardio")
  const cardio = await createAs(owner, "cardio_sessions", {
    user: owner.id,
    activity_type: "running",
    distance_km: 5,
    duration_seconds: 1800,
  })

  await createAs(reactor, "feed_reactions", { session_id: cardio.id, reactor: reactor.id, emoji: "🏃" })
  const [notif] = await expectNotifications(owner.id, "reaction", 1, "reacción a cardio notifica al dueño")
  assert.equal(notif.reference_id, cardio.id)
})

test("comentarios: owner, reply y dedup cuando owner == autor del padre", async () => {
  const owner = await createUser("Dueno Post")
  const commenter = await createUser("Comentarista")
  const session = await makeSession(owner)

  // 1. Comentario top-level de otro → notifica al dueño
  const c1 = await createAs(commenter, "comments", {
    session_id: session.id,
    author: commenter.id,
    text: "Buen entrenamiento, sigue así!",
  })
  const [n1] = await expectNotifications(owner.id, "comment", 1, "comentario notifica al dueño")
  assert.equal(n1.actor, commenter.id)
  assert.equal(n1.data.preview, "Buen entrenamiento, sigue así!")
  assert.equal(n1.data.commentId, c1.id)

  // 2. El dueño responde → notifica al autor del padre; a sí mismo no
  await createAs(owner, "comments", {
    session_id: session.id,
    author: owner.id,
    text: "Gracias!",
    parent_id: c1.id,
  })
  const [n2] = await expectNotifications(commenter.id, "comment_reply", 1, "reply notifica al autor del padre")
  assert.equal(n2.actor, owner.id)

  // 3. Comentarista responde a un comentario del propio dueño → el dueño
  //    recibe SOLO comment_reply (dedup: owner == autor del padre)
  const ownerComment = await createAs(owner, "comments", {
    session_id: session.id,
    author: owner.id,
    text: "Comentario propio del dueño",
  })
  await createAs(commenter, "comments", {
    session_id: session.id,
    author: commenter.id,
    text: "Respondiendo al dueño",
    parent_id: ownerComment.id,
  })
  await expectNotifications(owner.id, "comment_reply", 1, "el dueño recibe comment_reply")
  // La notif 'comment' del dueño se queda en 1 (solo la del paso 1): dedup OK
  await expectNotifications(owner.id, "comment", 1, "sin notif 'comment' duplicada para el dueño")
})

test("reacción a comentario notifica a su autor", async () => {
  const owner = await createUser("Dueno CR")
  const author = await createUser("Autor Comentario")
  const reactor = await createUser("Reactor Comentario")
  const session = await makeSession(owner)

  const comment = await createAs(author, "comments", {
    session_id: session.id,
    author: author.id,
    text: "Qué buen ritmo llevas en este bloque de fondo",
  })

  await createAs(reactor, "comment_reactions", { comment_id: comment.id, reactor: reactor.id, emoji: "❤️" })

  const [notif] = await expectNotifications(author.id, "reaction", 1, "reacción a comentario → autor")
  assert.equal(notif.actor, reactor.id)
  assert.equal(notif.reference_id, session.id, "reference_id es la sesión (deep-link al post)")
  assert.equal(notif.data.onComment, true)
  assert.equal(notif.data.commentId, comment.id)
})
