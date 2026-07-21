/**
 * user_blocks.pb.js (efectos transaccionales) + block_guards.pb.js (rechazos 400).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, createAs, create, remove, getOne, list, waitFor,
} from "./helpers/client.mjs"

async function expect400(promise, msg) {
  try {
    await promise
    assert.fail(`${msg}: esperaba 400 y la creación pasó`)
  } catch (err) {
    assert.equal(err.status, 400, `${msg}: status ${err.status}`)
  }
}

test("bloquear ejecuta unfollow mutuo, espejo blocked_users y borra notifs del par", async () => {
  const blocker = await createUser("Bloqueador")
  const blocked = await createUser("Bloqueado")

  // Estado previo: se seguían y había una notificación entre ellos
  await createAs(blocker, "follows", { follower: blocker.id, following: blocked.id })
  await createAs(blocked, "follows", { follower: blocked.id, following: blocker.id })
  await waitFor(
    async () => (await list("notifications", `user = '${blocker.id}' && actor = '${blocked.id}'`)).length > 0,
    "notif previa entre el par (la genera el follow)"
  )

  await createAs(blocker, "user_blocks", { blocker: blocker.id, blocked: blocked.id })

  const follows = await list(
    "follows",
    `(follower = '${blocker.id}' && following = '${blocked.id}') || (follower = '${blocked.id}' && following = '${blocker.id}')`
  )
  assert.equal(follows.length, 0, "unfollow en ambas direcciones")

  const blockerRec = await getOne("users", blocker.id)
  assert.ok(blockerRec.blocked_users.includes(blocked.id), "espejo blocked_users actualizado")

  const notifs = await list(
    "notifications",
    `(user = '${blocker.id}' && actor = '${blocked.id}') || (user = '${blocked.id}' && actor = '${blocker.id}')`
  )
  assert.equal(notifs.length, 0, "notificaciones del par borradas")
})

test("guards: interacciones entre bloqueados devuelven 400 genérico", async () => {
  const a = await createUser("Guard A")
  const b = await createUser("Guard B")

  const session = await createAs(a, "sessions", {
    user: a.id, workout_key: "w", phase: 1, day: "day1",
    completed_at: "2026-07-21 10:00:00.000Z",
  })
  const comment = await createAs(a, "comments", {
    session_id: session.id, author: a.id, text: "mi propio comentario",
  })
  const challenge = await createAs(a, "challenges", {
    creator: a.id, title: "Reto guard", metric: "sessions",
    starts_at: "2026-07-20", ends_at: "2026-07-27", status: "active",
  })

  await createAs(a, "user_blocks", { blocker: a.id, blocked: b.id })

  await expect400(createAs(b, "follows", { follower: b.id, following: a.id }), "follow B→A")
  await expect400(createAs(a, "follows", { follower: a.id, following: b.id }), "follow A→B")
  await expect400(
    createAs(b, "comments", { session_id: session.id, author: b.id, text: "hola" }),
    "comentario de B en sesión de A"
  )
  await expect400(
    createAs(b, "feed_reactions", { session_id: session.id, reactor: b.id, emoji: "🔥" }),
    "reacción de B a sesión de A"
  )
  await expect400(
    createAs(b, "comment_reactions", { comment_id: comment.id, reactor: b.id, emoji: "❤️" }),
    "reacción de B a comentario de A"
  )
  await expect400(
    createAs(b, "challenge_participants", { challenge: challenge.id, user: b.id }),
    "B uniéndose al reto de A"
  )
})

test("desbloquear limpia el espejo y vuelve a permitir interacciones", async () => {
  const a = await createUser("Unblock A")
  const b = await createUser("Unblock B")

  const block = await createAs(a, "user_blocks", { blocker: a.id, blocked: b.id })
  await waitFor(async () => {
    const rec = await getOne("users", a.id)
    return rec.blocked_users.includes(b.id)
  }, "espejo poblado tras bloquear")

  await remove("user_blocks", block.id)

  await waitFor(async () => {
    const rec = await getOne("users", a.id)
    return !rec.blocked_users.includes(b.id)
  }, "espejo limpio tras desbloquear")

  // Ahora el follow vuelve a pasar
  const follow = await createAs(b, "follows", { follower: b.id, following: a.id })
  assert.ok(follow.id, "follow permitido tras desbloquear")
})
