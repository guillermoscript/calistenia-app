/**
 * Bloqueo en notificaciones y push (#386).
 *
 * `createNotification` ya cortaba el par bloqueado, pero `sendPush` no tenía
 * ninguna comprobación: la notificación in-app se suprimía y el push salía
 * igual, con el nombre del otro usuario y el texto del contenido. Estos tests
 * cubren las dos vías por las que eso era alcanzable.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, createAs, create, list, waitFor, getOne,
  resetPushes, pushes, sleep, api, authAs, update, uniq,
} from "./helpers/client.mjs"

async function blockAndWait(blocker, blocked) {
  await createAs(blocker, "user_blocks", { blocker: blocker.id, blocked: blocked.id })
  await waitFor(async () => {
    const rec = await getOne("users", blocker.id)
    return rec.blocked_users.includes(blocked.id)
  }, "espejo blocked_users poblado")
}

test("responder al comentario de quien te bloqueó se rechaza, aunque la sesión sea de un tercero", async () => {
  const a = await createUser("Reply A")
  const b = await createUser("Reply B")
  const c = await createUser("Reply C")

  // La sesión es de C: el guard antiguo solo miraba al dueño de la sesión, así
  // que B pasaba el filtro aunque el comentario padre fuera de A.
  const session = await createAs(c, "sessions", {
    user: c.id, workout_key: "wk", phase: 1, day: "day1",
    completed_at: "2026-07-21 10:00:00.000Z",
  })
  const parent = await createAs(a, "comments", {
    session_id: session.id, author: a.id, text: "comentario de A",
  })

  await blockAndWait(a, b)

  try {
    await createAs(b, "comments", {
      session_id: session.id, author: b.id, parent_id: parent.id,
      text: "respuesta que no debería llegar",
    })
    assert.fail("la respuesta de B al comentario de A debería dar 400")
  } catch (err) {
    assert.equal(err.status, 400, `esperaba 400 y fue ${err.status}`)
  }
})

test("el push de referral_bonus no sale si el referrer bloqueó al referido", async () => {
  await resetPushes()
  const referrer = await createUser("Bonus Referrer")
  const referred = await createUser("Bonus Referred")

  await createAs(referred, "referrals", {
    referrer: referrer.id, referred: referred.id, source: "quick_invite",
  })
  await waitFor(
    async () => (await list("follows", `follower = '${referrer.id}'`)).length > 0,
    "referral procesado"
  )

  // El bloqueo llega DESPUÉS del alta — es justo el caso que el guard de
  // creación de `referrals` no puede cubrir, porque ya pasó.
  await blockAndWait(referrer, referred)
  await resetPushes()

  // Primera sesión del referido → dispara checkReferralBonus.
  await createAs(referred, "sessions", {
    user: referred.id, workout_key: "wk", phase: 1, day: "day1",
    completed_at: "2026-07-21 10:00:00.000Z",
  })

  // Damos margen a que el hook corra; si el push saliera, aparecería aquí.
  await sleep(1500)
  const sent = await pushes()
  const leak = sent.filter(
    (p) => p.body?.user_id === referrer.id && /referido/i.test(p.body?.title || "")
  )
  assert.equal(
    leak.length, 0,
    `el referrer recibió ${leak.length} push del referido bloqueado: ${JSON.stringify(leak.map(p => p.body?.title))}`
  )

  // Y tampoco la notificación in-app (esto ya funcionaba; lo fijamos).
  const notifs = await list(
    "notifications",
    `user = '${referrer.id}' && actor = '${referred.id}' && type = 'referral_bonus'`
  )
  assert.equal(notifs.length, 0, "sin notificación in-app de referral_bonus")
})

test("referral-lookup: 404 para el bloqueado, pero sigue abierto para invitados", async () => {
  const inviter = await createUser("Lookup Inviter")
  const blocked = await createUser("Lookup Blocked")
  const other = await createUser("Lookup Other")

  // El campo referral_code valida ^[A-Z0-9\-]*$ (máx 20), igual que routes.test.mjs
  const code = uniq("BLK").toUpperCase().replace(/_/g, "-").slice(0, 20)
  await update("users", inviter.id, { referral_code: code })

  const path = `/api/public/referral-lookup/${code}`

  // Invitado anónimo: la landing debe seguir resolviendo el perfil.
  const anon = await api(path)
  assert.equal(anon.id, inviter.id, "el invitado anónimo sigue viendo al invitador")

  await createAs(inviter, "user_blocks", { blocker: inviter.id, blocked: blocked.id })
  await waitFor(async () => {
    const rec = await getOne("users", inviter.id)
    return rec.blocked_users.includes(blocked.id)
  }, "espejo blocked_users poblado")

  // Un tercero autenticado sin bloqueo sigue resolviendo.
  const ok = await api(path, { token: await authAs(other) })
  assert.equal(ok.id, inviter.id, "un tercero autenticado sigue viendo al invitador")

  // El bloqueado recibe 404, indistinguible de un código inexistente.
  try {
    await api(path, { token: await authAs(blocked) })
    assert.fail("el bloqueado no debería resolver el perfil del invitador")
  } catch (err) {
    assert.equal(err.status, 404, `esperaba 404 y fue ${err.status}`)
  }
})

test("sin bloqueo, el push de referral_bonus sí sale (el test detectaría un falso positivo)", async () => {
  await resetPushes()
  const referrer = await createUser("OK Referrer")
  const referred = await createUser("OK Referred")

  await createAs(referred, "referrals", {
    referrer: referrer.id, referred: referred.id, source: "quick_invite",
  })
  await waitFor(
    async () => (await list("follows", `follower = '${referrer.id}'`)).length > 0,
    "referral procesado"
  )
  await resetPushes()

  await createAs(referred, "sessions", {
    user: referred.id, workout_key: "wk", phase: 1, day: "day1",
    completed_at: "2026-07-21 10:00:00.000Z",
  })

  await waitFor(async () => {
    const sent = await pushes()
    return sent.some(
      (p) => p.body?.user_id === referrer.id && /referido/i.test(p.body?.title || "")
    )
  }, "el referrer sí recibe el push cuando no hay bloqueo")
})
