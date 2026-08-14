/**
 * push_token_takeover.pb.js — un dispositivo que cambia de cuenta se lleva su
 * token de push consigo.
 *
 * `expo_push_tokens.token` es único y la colección es owner-only en lectura, así
 * que el upsert del cliente (`apps/mobile/src/lib/push-registration.ts`) no podía
 * ver el registro de otro usuario para reasignarlo y moría con un 400
 * `validation_not_unique`, dejando los push del dispositivo en la cuenta vieja.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { createUser, createAs, listAs, list, uniq } from "./helpers/client.mjs"

test("el registro de otro usuario es invisible: por eso el cliente no podía reasignarlo", async () => {
  const viejo = await createUser("Dueño Viejo")
  const nuevo = await createUser("Dueño Nuevo")
  const token = uniq("fcm-token")
  await createAs(viejo, "expo_push_tokens", { user: viejo.id, token, platform: "android" })

  // Es exactamente la consulta que hace el cliente antes de crear.
  const visto = await listAs(nuevo, "expo_push_tokens", `token = "${token}"`)
  assert.equal(visto.length, 0, "listRule owner-only lo esconde, y sin error")
})

test("registrar un token que ya tenía otra cuenta lo reasigna en vez de fallar", async () => {
  const viejo = await createUser("Móvil Prestado")
  const nuevo = await createUser("Móvil Reclamado")
  const token = uniq("fcm-token")
  const previo = await createAs(viejo, "expo_push_tokens", {
    user: viejo.id, token, platform: "android",
  })

  // Sin el hook esto era un 400 validation_not_unique.
  const creado = await createAs(nuevo, "expo_push_tokens", {
    user: nuevo.id, token, platform: "android",
  })
  assert.equal(creado.user, nuevo.id, "el token queda en la cuenta nueva")

  const filas = await list("expo_push_tokens", `token = "${token}"`)
  assert.equal(filas.length, 1, "no se duplica: el registro previo se borró")
  assert.equal(filas[0].user, nuevo.id, "y el que queda es el del dueño nuevo")
  assert.notEqual(filas[0].id, previo.id, "es un registro nuevo, no el viejo reetiquetado")
})

test("el dueño viejo se queda sin ese token (los push dejan de irse a su cuenta)", async () => {
  const viejo = await createUser("Deja El Móvil")
  const nuevo = await createUser("Coge El Móvil")
  const token = uniq("fcm-token")
  await createAs(viejo, "expo_push_tokens", { user: viejo.id, token, platform: "android" })
  await createAs(nuevo, "expo_push_tokens", { user: nuevo.id, token, platform: "android" })

  const delViejo = await list("expo_push_tokens", `user = "${viejo.id}"`)
  assert.equal(delViejo.length, 0, "el emisor busca por user: ya no le manda nada")
})

test("un token nuevo se crea con normalidad y no toca los de otros dispositivos", async () => {
  const user = await createUser("Dos Móviles")
  const tokenA = uniq("fcm-token")
  const tokenB = uniq("fcm-token")

  await createAs(user, "expo_push_tokens", { user: user.id, token: tokenA, platform: "android" })
  await createAs(user, "expo_push_tokens", { user: user.id, token: tokenB, platform: "android" })

  const suyos = await list("expo_push_tokens", `user = "${user.id}"`)
  assert.equal(suyos.length, 2, "el hook solo borra cuando el token coincide")
})
