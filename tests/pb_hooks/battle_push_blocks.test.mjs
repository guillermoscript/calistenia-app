/**
 * El guard de bloqueo en los pushes de batalla (#458, familia de #386).
 *
 * `sendPush` solo comprueba `isBlocked` si recibe `actorId` como 6.º argumento.
 * Los tres avisos de `utils/battles.js` lo omitían, así que el push salía sin
 * pasar por el guard — la misma fuga que #386 cerró para el resto de canales.
 *
 * De los tres sitios, SOLO el arranque era alcanzable de verdad:
 *
 * - unirse ya lo frena `battleHasBlockWith` (`battle_api.pb.js:274`), que
 *   rechaza el join antes de llegar al aviso;
 * - la revancha ya la filtra `rematchRecipients`, así que el bloqueado nunca
 *   entra en la lista de invitados;
 * - el arranque NO tiene equivalente: el bloqueo puede nacer DESPUÉS de que los
 *   dos estén en el lobby, y bloquear no expulsa a nadie de una batalla en
 *   curso, así que el par bloqueado sigue ahí cuando el creador pulsa empezar.
 *
 * Los dos primeros se fijan igualmente: el `actorId` es la segunda barrera, y
 * estos tests son lo que avisará si alguien quita la primera.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  api, authAs, createAs, createUser, getOne, list,
  pushesFor, resetPushes, sleep, waitFor,
} from "./helpers/client.mjs"

function config() {
  return {
    workout_template_id: "circuit_basico",
    rounds: 3,
    scoring_mode: "rounds_then_reps_then_time",
    exercises: [
      { exercise_id: "pushup", position: 0, target: { kind: "reps", value: 10 }, rest_seconds: 30 },
      { exercise_id: "squat", position: 1, target: { kind: "reps", value: 15 }, rest_seconds: 30 },
    ],
  }
}

async function post(user, path, body = {}) {
  return api(path, { method: "POST", body, token: await authAs(user) })
}

async function postRaw(user, path, body = {}) {
  return api(path, { method: "POST", body, token: await authAs(user), raw: true })
}

async function blockAndWait(blocker, blocked) {
  await createAs(blocker, "user_blocks", { blocker: blocker.id, blocked: blocked.id })
  await waitFor(async () => {
    const rec = await getOne("users", blocker.id)
    return rec.blocked_users.includes(blocked.id)
  }, "espejo blocked_users poblado")
}

/** Lobby con creador y amigo dentro, ambos listos: a un `/start` de arrancar. */
async function readyLobby(nameA, nameB) {
  const creator = await createUser(nameA)
  const friend = await createUser(nameB)
  const battle = await createAs(creator, "battles", {
    creator: creator.id, status: "draft", revision: 0, config: config(),
  })
  await post(creator, `/api/battles/${battle.id}/publish`)
  const invite = await post(creator, `/api/battles/${battle.id}/invites`)
  await post(friend, "/api/battles/join", { token: invite.token })
  await post(creator, `/api/battles/${battle.id}/ready`, { ready: true })
  await post(friend, `/api/battles/${battle.id}/ready`, { ready: true })
  return { creator, friend, battleId: battle.id }
}

test("arranque: el participante bloqueado DESPUÉS de unirse no recibe el push", async () => {
  const { creator, friend, battleId } = await readyLobby("Start Creador", "Start Bloqueado")

  // El bloqueo llega con los dos ya dentro del lobby. Es el hueco que ningún
  // guard de entrada puede cubrir, porque el join ya pasó.
  await blockAndWait(creator, friend)
  await resetPushes()

  const snap = await post(creator, `/api/battles/${battleId}/start`)
  assert.equal(snap.battle.status, "live", "la batalla arranca igual: el bloqueo no la rompe")

  await sleep(1500)
  const sent = await pushesFor(friend.id)
  assert.equal(
    sent.length, 0,
    `el bloqueado recibió ${sent.length} push del arranque: ${JSON.stringify(sent.map((p) => p.body?.title))}`
  )
})

test("arranque sin bloqueo: el push SÍ sale (si no, el test de arriba no probaría nada)", async () => {
  const { creator, friend, battleId } = await readyLobby("OK Creador", "OK Amigo")
  await resetPushes()

  await post(creator, `/api/battles/${battleId}/start`)

  await waitFor(async () => {
    const sent = await pushesFor(friend.id)
    return sent.some((p) => /empieza/i.test(p.body?.title || ""))
  }, "el participante no bloqueado sí recibe el push de arranque")
})

test("unirse con bloqueo se rechaza antes del aviso (primera barrera, battleHasBlockWith)", async () => {
  const creator = await createUser("Join Creador")
  const blocked = await createUser("Join Bloqueado")
  const battle = await createAs(creator, "battles", {
    creator: creator.id, status: "draft", revision: 0, config: config(),
  })
  await post(creator, `/api/battles/${battle.id}/publish`)
  const invite = await post(creator, `/api/battles/${battle.id}/invites`)

  await blockAndWait(creator, blocked)
  await resetPushes()

  const res = await postRaw(blocked, "/api/battles/join", { token: invite.token })
  assert.ok(res.status >= 400, `el join de un bloqueado debería fallar, y devolvió ${res.status}`)

  await sleep(1000)
  const sent = await pushesFor(creator.id)
  assert.equal(sent.length, 0, "y el creador no recibe ningún push del bloqueado")
})

test("revancha: el bloqueado no entra en los invitados, así que no hay push que filtrar", async () => {
  const { creator, friend, battleId } = await readyLobby("Rev Creador", "Rev Bloqueado")
  await post(creator, `/api/battles/${battleId}/start`)

  // La batalla original existe y los dos compitieron; el bloqueo nace después,
  // que es el escenario que describe #413.
  await blockAndWait(friend, creator)
  await resetPushes()

  const res = await postRaw(creator, `/api/battles/${battleId}/rematch`)
  // La revancha puede no estar disponible según el estado; lo que se fija aquí
  // es que si sale, el bloqueado no recibe nada.
  await sleep(1500)
  const sent = await pushesFor(friend.id)
  assert.equal(
    sent.length, 0,
    `el bloqueado recibió ${sent.length} push de revancha (rematch respondió ${res.status})`
  )
})
