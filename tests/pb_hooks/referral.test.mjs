/**
 * referral_side_effects.pb.js: al crear un referral →
 * follows mutuos + puntos (100/50) + notificación y push al referrer.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, createAs, list, waitFor, waitForPush,
  expectNotifications, resetPushes,
} from "./helpers/client.mjs"

test("referral crea follows mutuos, puntos dobles y notifica al referrer", async () => {
  await resetPushes()
  const referrer = await createUser("Ref Errer")
  const referred = await createUser("Nuevo Usuario")

  // La API rule exige que el referred autenticado cree su propio referral.
  await createAs(referred, "referrals", {
    referrer: referrer.id,
    referred: referred.id,
    source: "quick_invite",
  })

  // 1. Follows mutuos
  await waitFor(async () => {
    const f1 = await list("follows", `follower = '${referrer.id}' && following = '${referred.id}'`)
    const f2 = await list("follows", `follower = '${referred.id}' && following = '${referrer.id}'`)
    return f1.length === 1 && f2.length === 1
  }, "follows mutuos referrer↔referred")

  // 2. Puntos: 100 al referrer, 50 al referido
  const ptReferrer = await waitFor(
    async () => (await list("point_transactions", `user = '${referrer.id}' && type = 'referral_signup'`))[0],
    "100 pts al referrer"
  )
  assert.equal(ptReferrer.amount, 100)
  assert.equal(ptReferrer.reference_id, referred.id)

  const ptReferred = await waitFor(
    async () => (await list("point_transactions", `user = '${referred.id}' && type = 'referral_bonus'`))[0],
    "50 pts de bienvenida al referido"
  )
  assert.equal(ptReferred.amount, 50)

  // 3. Notificación in-app + push al referrer
  const [notif] = await expectNotifications(referrer.id, "referral_signup", 1, "notif al referrer")
  assert.equal(notif.actor, referred.id)
  assert.equal(notif.data.referredName, "Nuevo Usuario")

  // Nota: los auto-follows del hook disparan en cascada el hook de follow
  // ("te sigue"), así que hay que buscar el push de referral específicamente.
  const push = await waitForPush(
    (p) => p.path === "/api/send-push" && p.body?.user_id === referrer.id && /se registro con tu enlace/.test(p.body.title || ""),
    "push referral_signup al referrer"
  )
  assert.equal(push.body.url, "/referrals")
  assert.equal(push.internalKey, "test-internal-key")
})

test("referral sin efectos duplicados si ya existía el follow", async () => {
  const referrer = await createUser("Ya Sigue")
  const referred = await createUser("Referido Dos")

  // El referrer ya seguía al referido → el auto-follow duplicado se salta sin romper el resto.
  await createAs(referrer, "follows", { follower: referrer.id, following: referred.id })

  await createAs(referred, "referrals", {
    referrer: referrer.id,
    referred: referred.id,
    source: "quick_invite",
  })

  await waitFor(
    async () => (await list("point_transactions", `user = '${referrer.id}' && type = 'referral_signup'`)).length === 1,
    "puntos igual se otorgan"
  )
  const f1 = await list("follows", `follower = '${referrer.id}' && following = '${referred.id}'`)
  assert.equal(f1.length, 1, "no duplica el follow existente")
})
