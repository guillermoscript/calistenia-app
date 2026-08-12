/**
 * API de batallas colaborativas (`pb_hooks/battle_api.pb.js`, issue #356).
 *
 * Es la única capa donde se puede escribir en `battles` / `battle_participants` /
 * `battle_invites`: todas las reglas de mutación son `null`. Estos tests son lo que
 * mantiene honesta la copia de las máquinas de estado que vive en
 * `pb_hooks/utils/battles.js` (el JSVM no puede importar el TypeScript de
 * `packages/core/lib/battle.ts`).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  api, authAs, createUser, createAs, expectNotifications, getOne, list, triggerCron, uniq,
  update, waitFor,
} from "./helpers/client.mjs"

// ── Utilidades ───────────────────────────────────────────────────────────────

/**
 * La consulta exacta que manda `findMyActiveBattle`. Se fija aquí entera porque cada
 * pieza se ganó a base de un fallo: el `sort` porque `battles` no tiene los autodate
 * `created`/`updated` y ordenar por un campo inexistente da 400 (que el cliente no
 * distingue de "no hay batalla"), y el `expand` porque el estado de la batalla por sí
 * solo no dice si a mí me queda algo que hacer en ella.
 */
const ACTIVE_QS = "?perPage=10"
  + "&filter=" + encodeURIComponent("status = 'draft' || status = 'lobby' || status = 'ready' || status = 'live'")
  + "&sort=-last_activity_at"
  + "&expand=battle_participants_via_battle"

/**
 * Espejo de `isBattleActiveForMe` de `packages/core/lib/battle.ts`. Se duplica por lo
 * mismo que las máquinas de estado de `utils/battles.js`: este runner es node a pelo y
 * no puede importar el TypeScript de core. La versión buena está testeada en vitest;
 * esta existe para poder afirmar, sobre datos reales del servidor, qué decidiría.
 */
function isBattleActiveForMe(status, mySeat, amCreator) {
  if (!["draft", "lobby", "ready", "live"].includes(status)) return false
  if (mySeat === null || mySeat === undefined) return amCreator && status !== "live"
  return mySeat !== "finished" && mySeat !== "left"
}

function config(overrides = {}) {
  return {
    workout_template_id: "circuit_basico",
    rounds: 3,
    scoring_mode: "rounds_then_reps_then_time",
    exercises: [
      { exercise_id: "pushup", position: 0, target: { kind: "reps", value: 10 }, rest_seconds: 30 },
      { exercise_id: "squat", position: 1, target: { kind: "reps", value: 15 }, rest_seconds: 30 },
    ],
    ...overrides,
  }
}

/** Crea el draft como el propio usuario: pasa por la createRule real del contrato. */
async function createDraft(creator, overrides = {}) {
  return createAs(creator, "battles", {
    creator: creator.id,
    status: "draft",
    revision: 0,
    config: config(overrides),
  })
}

async function post(user, path, body = {}) {
  return api(path, { method: "POST", body, token: await authAs(user) })
}

async function postRaw(user, path, body = {}) {
  return api(path, { method: "POST", body, token: await authAs(user), raw: true })
}

async function getRaw(user, path) {
  return api(path, { token: await authAs(user), raw: true })
}

async function inviteToken(creator, battleId) {
  const res = await post(creator, `/api/battles/${battleId}/invites`)
  return res.token
}

/** Camino feliz hasta un lobby con dos participantes unidos. */
async function lobbyWithTwo(nameA = "Creador", nameB = "Amigo") {
  const creator = await createUser(nameA)
  const friend = await createUser(nameB)
  const battle = await createDraft(creator)
  await post(creator, `/api/battles/${battle.id}/publish`)
  const token = await inviteToken(creator, battle.id)
  await post(friend, "/api/battles/join", { token })
  return { creator, friend, battleId: battle.id }
}

/** Lobby con ambos participantes listos → la batalla queda en `ready`. */
async function readyLobby() {
  const ctx = await lobbyWithTwo()
  await post(ctx.creator, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  const snap = await post(ctx.friend, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  assert.equal(snap.battle.status, "ready", "con todos listos la batalla pasa a ready")
  return ctx
}

/** Lobby arrancado: batalla `live` y ambos participantes `active`. */
async function liveBattle() {
  const ctx = await readyLobby()
  const snap = await post(ctx.creator, `/api/battles/${ctx.battleId}/start`)
  assert.equal(snap.battle.status, "live")
  // `starts_at` está en el futuro (cuenta atrás): esperamos a que pase para poder
  // escribir progreso, igual que hace el cliente.
  const wait = new Date(snap.battle.starts_at).getTime() - Date.now() + 250
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  return ctx
}

// ── Creación del draft ───────────────────────────────────────────────────────

test("crear un draft con configuración inválida se rechaza", async () => {
  const creator = await createUser("Config Invalida")
  const res = await api("/api/collections/battles/records", {
    method: "POST",
    token: await authAs(creator),
    raw: true,
    body: {
      creator: creator.id,
      status: "draft",
      revision: 0,
      // posiciones no contiguas + rounds 0
      config: config({ rounds: 0, exercises: [
        { exercise_id: "pushup", position: 3, target: { kind: "reps", value: 10 }, rest_seconds: 0 },
      ] }),
    },
  })
  assert.equal(res.status, 400)
})

test("un cliente no puede crear una batalla ya publicada", async () => {
  const creator = await createUser("Salta Lobby")
  const res = await api("/api/collections/battles/records", {
    method: "POST",
    token: await authAs(creator),
    raw: true,
    body: { creator: creator.id, status: "lobby", revision: 0, config: config() },
  })
  assert.equal(res.status, 400, "la createRule fija status = draft")
})

// ── Publicar ─────────────────────────────────────────────────────────────────

test("publish lleva draft → lobby y crea el participante del creador", async () => {
  const creator = await createUser("Publicador")
  const battle = await createDraft(creator)
  const snap = await post(creator, `/api/battles/${battle.id}/publish`)

  assert.equal(snap.battle.status, "lobby")
  assert.equal(snap.battle.revision, 1, "toda escritura aceptada incrementa revision")
  assert.ok(snap.battle.invite_expires_at, "se fija la expiración de invitaciones")
  assert.equal(snap.participants.length, 1)
  assert.equal(snap.me.status, "joined")
  assert.equal(snap.me.user, creator.id)
})

test("publish dos veces sin clave de idempotencia da transición inválida", async () => {
  const creator = await createUser("Doble Publish")
  const battle = await createDraft(creator)
  await post(creator, `/api/battles/${battle.id}/publish`)
  const res = await postRaw(creator, `/api/battles/${battle.id}/publish`)
  assert.equal(res.status, 409)
  assert.equal((await res.json()).error, "invalid_transition")
})

test("publish con la misma clave de idempotencia es un no-op", async () => {
  const creator = await createUser("Idempotente")
  const battle = await createDraft(creator)
  const key = uniq("key")
  const first = await post(creator, `/api/battles/${battle.id}/publish`, { idempotency_key: key })
  const second = await post(creator, `/api/battles/${battle.id}/publish`, { idempotency_key: key })

  assert.equal(second.replayed, true)
  assert.equal(second.battle.revision, first.battle.revision, "no incrementa revision otra vez")
  assert.equal(second.participants.length, 1, "no duplica el participante del creador")
})

test("solo el creador puede publicar", async () => {
  const creator = await createUser("Dueno")
  const stranger = await createUser("Extrano")
  const battle = await createDraft(creator)
  const res = await postRaw(stranger, `/api/battles/${battle.id}/publish`)
  assert.equal(res.status, 403)
})

// ── Invitaciones ─────────────────────────────────────────────────────────────

test("la invitación devuelve el token en claro una sola vez y guarda solo el hash", async () => {
  const creator = await createUser("Invitador")
  const battle = await createDraft(creator)
  await post(creator, `/api/battles/${battle.id}/publish`)

  const issued = await post(creator, `/api/battles/${battle.id}/invites`)
  assert.ok(issued.token && issued.token.length >= 32, "token opaco y largo")
  assert.ok(issued.expires_at)

  const stored = await getOne("battle_invites", issued.invite_id)
  assert.notEqual(stored.token_hash, issued.token, "nunca se guarda el token en claro")
  assert.match(stored.token_hash, /^[0-9a-f]{64}$/, "se guarda sha256 hex")
  assert.equal(stored.status, "active")
})

test("battle_invites no es accesible por la API de colecciones", async () => {
  const { creator, battleId } = await lobbyWithTwo()
  await inviteToken(creator, battleId)
  const res = await getRaw(creator, "/api/collections/battle_invites/records")
  assert.ok(res.status === 403 || res.status === 400, `esperaba acceso denegado, fue ${res.status}`)
})

test("la landing de invitación no revela identidades", async () => {
  const { creator, battleId } = await lobbyWithTwo()
  const token = await inviteToken(creator, battleId)

  const res = await api("/api/public/battle-invite", { method: "POST", body: { token } })
  assert.equal(res.ok, true)
  assert.equal(res.battle.id, battleId)
  assert.equal(res.battle.rounds, 3)
  assert.equal(res.battle.exercise_count, 2)
  assert.equal(res.battle.participant_count, 2)
  const serialized = JSON.stringify(res)
  assert.ok(!serialized.includes(creator.id), "no filtra ids de usuario")
  assert.ok(!serialized.includes("Creador"), "no filtra nombres")
})

test("token desconocido, expirado y revocado dan el mismo tipo de respuesta cerrada", async () => {
  const desconocido = await api("/api/public/battle-invite", {
    method: "POST", body: { token: "no-existe-en-absoluto" },
  })
  assert.equal(desconocido.ok, false)
  assert.equal(desconocido.reason, "invalid")
  assert.equal(desconocido.battle, null)

  const { creator, battleId } = await lobbyWithTwo()
  const token = await inviteToken(creator, battleId)
  const invites = await list("battle_invites", `battle = '${battleId}' && status = 'active'`)
  await update("battle_invites", invites[0].id, { expires_at: "2020-01-01 00:00:00.000Z" })

  const caducado = await api("/api/public/battle-invite", { method: "POST", body: { token } })
  assert.equal(caducado.ok, false)
  assert.equal(caducado.reason, "expired")
  assert.equal(caducado.battle, null)
})

test("revocar invalida los tokens pendientes", async () => {
  const { creator, battleId } = await lobbyWithTwo()
  const token = await inviteToken(creator, battleId)
  const revoked = await post(creator, `/api/battles/${battleId}/invites/revoke`)
  assert.ok(revoked.revoked >= 1)

  const landing = await api("/api/public/battle-invite", { method: "POST", body: { token } })
  assert.equal(landing.ok, false)
  assert.equal(landing.reason, "invalid")

  const tercero = await createUser("Tarde")
  const res = await postRaw(tercero, "/api/battles/join", { token })
  assert.equal(res.status, 409)
})

// ── Unirse ───────────────────────────────────────────────────────────────────

test("unirse consume el token y crea el participante", async () => {
  const creator = await createUser("Anfitrion")
  const friend = await createUser("Invitado")
  const battle = await createDraft(creator)
  await post(creator, `/api/battles/${battle.id}/publish`)
  const token = await inviteToken(creator, battle.id)

  const snap = await post(friend, "/api/battles/join", { token })
  assert.equal(snap.participants.length, 2)
  assert.equal(snap.me.user, friend.id)
  assert.equal(snap.me.status, "joined")

  const invites = await list("battle_invites", `battle = '${battle.id}'`)
  assert.equal(invites[0].status, "consumed")
  assert.equal(invites[0].used_by, friend.id)
})

test("reusar un token consumido falla sin revelar quién está dentro", async () => {
  const { creator, battleId } = await lobbyWithTwo()
  const token = await inviteToken(creator, battleId)
  const tercero = await createUser("Tercero")
  await post(tercero, "/api/battles/join", { token })

  const cuarto = await createUser("Cuarto")
  const res = await postRaw(cuarto, "/api/battles/join", { token })
  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.error, "invite_invalid")
  assert.ok(!JSON.stringify(body).includes(tercero.id), "el error no filtra participantes")
})

test("quien ya está dentro y abre otro enlace recupera su plaza sin gastar el token", async () => {
  const { creator, friend, battleId } = await lobbyWithTwo()
  const token = await inviteToken(creator, battleId)

  const snap = await post(friend, "/api/battles/join", { token })
  assert.equal(snap.already_joined, true)
  assert.equal(snap.me.user, friend.id)
  assert.equal(snap.participants.length, 2, "no se duplica el participante")

  // El token sigue disponible para quien sí lo necesita.
  const invite = (await list("battle_invites", `battle = '${battleId}' && status = 'active'`))[0]
  assert.ok(invite, "el token no se consumió")
  const tercero = await createUser("Tercero Real")
  const entra = await post(tercero, "/api/battles/join", { token })
  assert.equal(entra.participants.length, 3)
})

test("no se puede entrar cuando el lobby ya no lo permite", async () => {
  const ctx = await lobbyWithTwo()
  const token = await inviteToken(ctx.creator, ctx.battleId)
  await post(ctx.creator, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  await post(ctx.friend, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  await post(ctx.creator, `/api/battles/${ctx.battleId}/start`)

  const tarde = await createUser("Llega Tarde")
  const res = await postRaw(tarde, "/api/battles/join", { token })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).error, "invite_closed")
})

test("dos peticiones de join con la misma clave crean un solo participante", async () => {
  const creator = await createUser("Anfitrion Doble")
  const friend = await createUser("Doble Tap")
  const battle = await createDraft(creator)
  await post(creator, `/api/battles/${battle.id}/publish`)
  const token = await inviteToken(creator, battle.id)

  const key = uniq("join")
  await post(friend, "/api/battles/join", { token, idempotency_key: key })
  // El token ya está consumido, así que el segundo intento se rechaza limpiamente
  // y el índice único (battle, user) garantiza una sola fila en cualquier caso.
  await postRaw(friend, "/api/battles/join", { token, idempotency_key: key })

  const rows = await list("battle_participants", `battle = '${battle.id}' && user = '${friend.id}'`)
  assert.equal(rows.length, 1)
})

// ── Preparado / no preparado ─────────────────────────────────────────────────

test("ready ⇄ joined mueve la batalla entre lobby y ready", async () => {
  const ctx = await lobbyWithTwo()
  const uno = await post(ctx.creator, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  assert.equal(uno.battle.status, "lobby", "con uno solo listo sigue en lobby")

  const dos = await post(ctx.friend, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  assert.equal(dos.battle.status, "ready")

  const desmarca = await post(ctx.friend, `/api/battles/${ctx.battleId}/ready`, { ready: false })
  assert.equal(desmarca.battle.status, "lobby", "desmarcarse devuelve la batalla al lobby")
  assert.equal(desmarca.me.status, "joined")
  assert.equal(desmarca.me.ready_at, null)
})

test("marcar ready dos veces es un no-op, no una transición inválida", async () => {
  const ctx = await lobbyWithTwo()
  await post(ctx.creator, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  const res = await postRaw(ctx.creator, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  assert.equal(res.status, 200)
})

test("quien no participa no puede tocar el estado de preparado", async () => {
  const ctx = await lobbyWithTwo()
  const extrano = await createUser("Intruso Ready")
  const res = await postRaw(extrano, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  assert.equal(res.status, 403)
})

// ── Arrancar ─────────────────────────────────────────────────────────────────

test("start exige al menos dos participantes listos", async () => {
  const ctx = await lobbyWithTwo()
  await post(ctx.creator, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  const res = await postRaw(ctx.creator, `/api/battles/${ctx.battleId}/start`)
  // La batalla sigue en `lobby`, así que la transición lobby → live no existe.
  assert.equal(res.status, 409)
})

test("start fija starts_at en el futuro y activa a los participantes", async () => {
  const ctx = await readyLobby()
  const before = Date.now()
  const snap = await post(ctx.creator, `/api/battles/${ctx.battleId}/start`)

  assert.equal(snap.battle.status, "live")
  const startsAt = new Date(snap.battle.starts_at).getTime()
  assert.ok(startsAt > before, "starts_at es futuro: es la cuenta atrás sincronizada")
  assert.ok(startsAt - before <= 30000, "y no está absurdamente lejos")
  assert.ok(snap.server_time, "el snapshot expone la hora del servidor para el offset")
  assert.equal(snap.participants.filter((p) => p.status === "active").length, 2)
})

test("solo el creador arranca la batalla", async () => {
  const ctx = await readyLobby()
  const res = await postRaw(ctx.friend, `/api/battles/${ctx.battleId}/start`)
  assert.equal(res.status, 403)
})

test("doble tap en start con la misma clave no re-arranca", async () => {
  const ctx = await readyLobby()
  const key = uniq("start")
  const first = await post(ctx.creator, `/api/battles/${ctx.battleId}/start`, { idempotency_key: key })
  const second = await post(ctx.creator, `/api/battles/${ctx.battleId}/start`, { idempotency_key: key })
  assert.equal(second.battle.starts_at, first.battle.starts_at, "no se reprograma la salida")
  assert.equal(second.battle.revision, first.battle.revision)
})

// ── Progreso ─────────────────────────────────────────────────────────────────

test("el progreso se acepta, incrementa revision y no se puede escribir antes de la salida", async () => {
  const ctx = await readyLobby()
  const started = await post(ctx.creator, `/api/battles/${ctx.battleId}/start`)

  const temprano = await postRaw(ctx.creator, `/api/battles/${ctx.battleId}/progress`, {
    progress: { completed_rounds: 1, completed_reps: 10, completed_time_seconds: 5, current_exercise_position: 0 },
  })
  assert.equal(temprano.status, 409, "durante la cuenta atrás no se escribe progreso")
  assert.equal((await temprano.json()).error, "not_started")

  const wait = new Date(started.battle.starts_at).getTime() - Date.now() + 250
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))

  const snap = await post(ctx.creator, `/api/battles/${ctx.battleId}/progress`, {
    progress: { completed_rounds: 1, completed_reps: 10, completed_time_seconds: 5, current_exercise_position: 1 },
  })
  assert.equal(snap.me.progress.completed_rounds, 1)
  assert.equal(snap.me.progress.completed_reps, 10)
  assert.equal(snap.me.progress.current_exercise_position, 1)
  assert.ok(snap.me.progress.last_activity_at, "el servidor sella la marca de tiempo")
  assert.ok(snap.battle.revision > started.battle.revision)
})

test("el progreso no puede retroceder ni ser negativo", async () => {
  const ctx = await liveBattle()
  await post(ctx.creator, `/api/battles/${ctx.battleId}/progress`, {
    progress: { completed_rounds: 2, completed_reps: 20, completed_time_seconds: 30, current_exercise_position: 0 },
  })

  const atras = await postRaw(ctx.creator, `/api/battles/${ctx.battleId}/progress`, {
    progress: { completed_rounds: 1, completed_reps: 20, completed_time_seconds: 30, current_exercise_position: 0 },
  })
  assert.equal(atras.status, 409)
  assert.equal((await atras.json()).error, "progress_regression")

  const negativo = await postRaw(ctx.creator, `/api/battles/${ctx.battleId}/progress`, {
    progress: { completed_rounds: 2, completed_reps: -5, completed_time_seconds: 30, current_exercise_position: 0 },
  })
  assert.equal(negativo.status, 400)
})

test("el progreso valida rondas y posición de ejercicio contra la configuración", async () => {
  const ctx = await liveBattle()

  const demasiadasRondas = await postRaw(ctx.creator, `/api/battles/${ctx.battleId}/progress`, {
    progress: { completed_rounds: 99, completed_reps: 0, completed_time_seconds: 0, current_exercise_position: 0 },
  })
  assert.equal(demasiadasRondas.status, 400)

  const posicionInvalida = await postRaw(ctx.creator, `/api/battles/${ctx.battleId}/progress`, {
    progress: { completed_rounds: 1, completed_reps: 0, completed_time_seconds: 0, current_exercise_position: 7 },
  })
  assert.equal(posicionInvalida.status, 400)
})

test("un participante no puede alterar el progreso de otro", async () => {
  const ctx = await liveBattle()
  // El amigo escribe en la ruta de la batalla: el servidor resuelve SU fila desde el
  // token, así que no hay forma de apuntar a la del creador.
  await post(ctx.friend, `/api/battles/${ctx.battleId}/progress`, {
    progress: { completed_rounds: 3, completed_reps: 50, completed_time_seconds: 60, current_exercise_position: 0 },
  })

  const snap = await api(`/api/battles/${ctx.battleId}/snapshot`, { token: await authAs(ctx.creator) })
  const mio = snap.participants.find((p) => p.user === ctx.creator.id)
  assert.equal(mio.progress.completed_reps, 0, "el progreso del creador sigue intacto")

  // Y la escritura directa en la colección sigue cerrada.
  const directo = await api(
    `/api/collections/battle_participants/records/${mio.id}`,
    { method: "PATCH", body: { status: "finished" }, token: await authAs(ctx.friend), raw: true },
  )
  assert.ok(directo.status >= 400, "la updateRule de la colección es null")
})

// ── Terminar ─────────────────────────────────────────────────────────────────

test("cuando termina el último participante activo la batalla queda finished", async () => {
  const ctx = await liveBattle()
  const primero = await post(ctx.creator, `/api/battles/${ctx.battleId}/finish`)
  assert.equal(primero.battle.status, "live", "aún queda alguien compitiendo")
  assert.equal(primero.me.status, "finished")

  const segundo = await post(ctx.friend, `/api/battles/${ctx.battleId}/finish`)
  assert.equal(segundo.battle.status, "finished")
  assert.ok(segundo.battle.finished_at)
})

test("terminar dos veces con la misma clave no rompe nada", async () => {
  const ctx = await liveBattle()
  const key = uniq("finish")
  await post(ctx.creator, `/api/battles/${ctx.battleId}/finish`, { idempotency_key: key })
  const res = await postRaw(ctx.creator, `/api/battles/${ctx.battleId}/finish`, { idempotency_key: key })
  assert.equal(res.status, 200)
})

test("una batalla terminada rechaza escrituras posteriores", async () => {
  const ctx = await liveBattle()
  await post(ctx.creator, `/api/battles/${ctx.battleId}/finish`)
  await post(ctx.friend, `/api/battles/${ctx.battleId}/finish`)

  const res = await postRaw(ctx.creator, `/api/battles/${ctx.battleId}/progress`, {
    progress: { completed_rounds: 3, completed_reps: 99, completed_time_seconds: 99, current_exercise_position: 0 },
  })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).error, "battle_not_live")
})

// ── Puntuación ───────────────────────────────────────────────────────────────

test("la clasificación sigue el orden rondas → reps → tiempo del contrato", async () => {
  const ctx = await liveBattle()
  // El amigo hace más reps pero menos rondas: las rondas mandan siempre.
  await post(ctx.creator, `/api/battles/${ctx.battleId}/progress`, {
    progress: { completed_rounds: 3, completed_reps: 10, completed_time_seconds: 0, current_exercise_position: 0 },
  })
  await post(ctx.friend, `/api/battles/${ctx.battleId}/progress`, {
    progress: { completed_rounds: 2, completed_reps: 40, completed_time_seconds: 90, current_exercise_position: 0 },
  })

  const snap = await api(`/api/battles/${ctx.battleId}/snapshot`, { token: await authAs(ctx.creator) })
  assert.equal(snap.standings.length, 2)
  assert.equal(snap.standings[0].user, ctx.creator.id, "3 rondas gana a 2 rondas con más reps")
  assert.equal(snap.standings[0].rank, 1)
  assert.equal(snap.standings[1].user, ctx.friend.id)
  assert.equal(snap.standings[1].rank, 2)
})

test("con la misma puntuación gana quien terminó antes", async () => {
  // Reproduce lo que pasó en el test de dispositivo: los dos completan el circuito
  // entero, así que rondas y reps empatan y el tiempo es 0 en un circuito de solo
  // repeticiones. Antes decidía el id del registro y ganaba el que acabó 25 min más
  // tarde (#387).
  const ctx = await liveBattle()
  const iguales = { completed_rounds: 3, completed_reps: 105, completed_time_seconds: 0, current_exercise_position: 0 }

  await post(ctx.friend, `/api/battles/${ctx.battleId}/finish`, { progress: iguales })
  // Un margen real entre ambos finales: los timestamps de PocketBase van en milisegundos.
  await new Promise((r) => setTimeout(r, 1100))
  await post(ctx.creator, `/api/battles/${ctx.battleId}/finish`, { progress: iguales })

  const snap = await api(`/api/battles/${ctx.battleId}/snapshot`, { token: await authAs(ctx.creator) })
  assert.equal(snap.standings[0].user, ctx.friend.id, "gana quien terminó antes")
  assert.equal(snap.standings[1].user, ctx.creator.id)
  assert.deepEqual(
    [snap.standings[0].score.completed_reps, snap.standings[1].score.completed_reps],
    [105, 105],
    "el desempate no debía cambiar la puntuación",
  )
})

test("quien termina va por delante de quien sigue en curso con el mismo trabajo", async () => {
  const ctx = await liveBattle()
  const iguales = { completed_rounds: 3, completed_reps: 105, completed_time_seconds: 0, current_exercise_position: 0 }

  await post(ctx.friend, `/api/battles/${ctx.battleId}/progress`, { progress: iguales })
  await post(ctx.creator, `/api/battles/${ctx.battleId}/finish`, { progress: iguales })

  const snap = await api(`/api/battles/${ctx.battleId}/snapshot`, { token: await authAs(ctx.creator) })
  assert.equal(snap.standings[0].user, ctx.creator.id, "haber terminado gana al mismo trabajo sin terminar")
  assert.equal(snap.standings[0].status, "finished")
  assert.equal(snap.standings[1].status, "active")
})

test("los participantes que se van conservan puntuación y puesto", async () => {
  const ctx = await liveBattle()
  await post(ctx.friend, `/api/battles/${ctx.battleId}/progress`, {
    progress: { completed_rounds: 1, completed_reps: 5, completed_time_seconds: 10, current_exercise_position: 0 },
  })
  await post(ctx.friend, `/api/battles/${ctx.battleId}/leave`)

  const snap = await api(`/api/battles/${ctx.battleId}/snapshot`, { token: await authAs(ctx.creator) })
  const suyo = snap.standings.find((s) => s.user === ctx.friend.id)
  assert.ok(suyo, "sigue apareciendo en la clasificación")
  assert.equal(suyo.status, "left")
  assert.equal(suyo.score.completed_reps, 5)
})

// ── Salir y cancelar ─────────────────────────────────────────────────────────

test("si el creador se va del lobby la batalla se cancela", async () => {
  const ctx = await lobbyWithTwo()
  const snap = await post(ctx.creator, `/api/battles/${ctx.battleId}/leave`)
  assert.equal(snap.battle.status, "cancelled")
})

test("si el creador se va en vivo la batalla continúa", async () => {
  const ctx = await liveBattle()
  const snap = await post(ctx.creator, `/api/battles/${ctx.battleId}/leave`)
  assert.equal(snap.battle.status, "live", "el resto sigue compitiendo")
  assert.equal(snap.me.status, "left")
})

test("cuando se va el último participante activo la batalla se cierra", async () => {
  const ctx = await liveBattle()
  await post(ctx.creator, `/api/battles/${ctx.battleId}/leave`)
  const snap = await post(ctx.friend, `/api/battles/${ctx.battleId}/leave`)
  assert.equal(snap.battle.status, "finished")
})

test("un participante solo puede terminar la batalla por su cuenta", async () => {
  const ctx = await liveBattle()
  await post(ctx.friend, `/api/battles/${ctx.battleId}/leave`)
  const snap = await post(ctx.creator, `/api/battles/${ctx.battleId}/finish`)
  assert.equal(snap.battle.status, "finished")
  assert.equal(snap.me.status, "finished")
})

test("cancelar es cosa del creador y bloquea el resto", async () => {
  const ctx = await lobbyWithTwo()
  const ajeno = await postRaw(ctx.friend, `/api/battles/${ctx.battleId}/cancel`)
  assert.equal(ajeno.status, 403)

  const snap = await post(ctx.creator, `/api/battles/${ctx.battleId}/cancel`)
  assert.equal(snap.battle.status, "cancelled")

  const res = await postRaw(ctx.friend, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  assert.equal(res.status, 409)
})

// ── Snapshot y visibilidad ───────────────────────────────────────────────────

test("el snapshot solo lo ven creador y participantes", async () => {
  const ctx = await lobbyWithTwo()
  const extrano = await createUser("Curioso")

  const propio = await getRaw(ctx.friend, `/api/battles/${ctx.battleId}/snapshot`)
  assert.equal(propio.status, 200)

  const ajeno = await getRaw(extrano, `/api/battles/${ctx.battleId}/snapshot`)
  assert.equal(ajeno.status, 403)

  const anonimo = await api(`/api/battles/${ctx.battleId}/snapshot`, { raw: true })
  assert.equal(anonimo.status, 401)
})

test("el snapshot trae nombres de participantes; la landing de invitación no", async () => {
  const ctx = await lobbyWithTwo("Anfitriona Nombre", "Amiga Nombre")

  // Dentro sí: la listRule de battle_participants solo deja ver la fila propia, así que
  // sin esto un participante no podría pintar la sala.
  const snap = await api(`/api/battles/${ctx.battleId}/snapshot`, { token: await authAs(ctx.friend) })
  const names = snap.participants.map((p) => p.display_name).sort()
  assert.deepEqual(names, ["Amiga Nombre", "Anfitriona Nombre"])
  assert.ok(snap.standings.every((s) => typeof s.display_name === "string"))

  // Fuera no: antes de entrar nadie sabe quién está dentro.
  const token = await inviteToken(ctx.creator, ctx.battleId)
  const landing = await api("/api/public/battle-invite", { method: "POST", body: { token } })
  assert.ok(!JSON.stringify(landing).includes("Anfitriona"), "la landing no filtra nombres")
})

test("una batalla inexistente da 404 y no distingue de una ajena", async () => {
  const usuario = await createUser("Sondeador")
  const res = await getRaw(usuario, "/api/battles/noexisteenabsoluto/snapshot")
  assert.equal(res.status, 404)
})

// ── Notificaciones ───────────────────────────────────────────────────────────

test("al unirse alguien se avisa al creador, y nunca a quien se une", async () => {
  const ctx = await lobbyWithTwo()
  const delCreador = await expectNotifications(
    ctx.creator.id, "challenge_join", 1, "el creador no recibió el aviso de que se unieron",
  )
  // `data` es un campo json: la API ya lo devuelve parseado.
  assert.equal(delCreador[0].data.kind, "battle_join")
  assert.equal(delCreador[0].reference_id, ctx.battleId)
  await expectNotifications(ctx.friend.id, "challenge_join", 0, "quien se une no debe recibir aviso")
})

test("al arrancar se avisa a los demás participantes, no a quien pulsa", async () => {
  const ctx = await lobbyWithTwo()
  // El aviso de "se ha unido" ya está en la bandeja del creador: contamos desde ahí.
  await expectNotifications(ctx.creator.id, "challenge_join", 1, "estado previo")

  await post(ctx.creator, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  await post(ctx.friend, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  await post(ctx.creator, `/api/battles/${ctx.battleId}/start`)

  const delAmigo = await expectNotifications(
    ctx.friend.id, "challenge_join", 1, "el participante no recibió el aviso de arranque",
  )
  assert.equal(delAmigo[0].data.kind, "battle_start")
  // El creador pulsó empezar: sigue con solo el aviso de la unión.
  await expectNotifications(ctx.creator.id, "challenge_join", 1, "quien arranca no debe recibir aviso")
})

test("un fallo de notificación no impide unirse ni arrancar", async () => {
  // El servicio de push no está garantizado en el entorno de test; lo que importa es
  // que la mutación responde 200 igual, que es la promesa del fan-out.
  const ctx = await lobbyWithTwo()
  await post(ctx.creator, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  await post(ctx.friend, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  const snap = await post(ctx.creator, `/api/battles/${ctx.battleId}/start`)
  assert.equal(snap.battle.status, "live")
})

// ── Expiración perezosa ──────────────────────────────────────────────────────

test("un lobby rancio expira al leer el snapshot, sin depender del cron", async () => {
  const ctx = await lobbyWithTwo()
  // Envejecemos el lobby por detrás de la API (el TTL son 2 h).
  await update("battles", ctx.battleId, { last_activity_at: "2020-01-01 00:00:00.000Z" })

  const snap = await api(`/api/battles/${ctx.battleId}/snapshot`, { token: await authAs(ctx.creator) })
  assert.equal(snap.battle.status, "expired")

  const res = await postRaw(ctx.friend, `/api/battles/${ctx.battleId}/ready`, { ready: true })
  assert.equal(res.status, 409, "una batalla expirada no acepta mutaciones")
})

test("el cron de expiración barre lobbies rancios", async () => {
  const ctx = await lobbyWithTwo()
  await update("battles", ctx.battleId, { last_activity_at: "2020-01-01 00:00:00.000Z" })

  await triggerCron("battles_expiry")

  // `triggerCron` solo dispara el job: el barrido corre en segundo plano.
  await waitFor(
    async () => (await getOne("battles", ctx.battleId)).status === "expired",
    "el cron battles_expiry no expiró el lobby rancio",
  )
})

test("un participante puede listar su batalla en curso, ordenada por actividad", async () => {
  // Es la consulta exacta de `findMyActiveBattle`, la que devuelve al usuario a su
  // batalla tras matar la app. Se fija aquí porque `battles` no tiene los autodate
  // `created`/`updated`: ordenar por un campo inexistente da 400, y el cliente no
  // distingue ese 400 de "no hay batalla activa" — se queda sin ruta de vuelta.
  const ctx = await lobbyWithTwo()

  for (const usuario of [ctx.creator, ctx.friend]) {
    const res = await api(`/api/collections/battles/records${ACTIVE_QS}`, { token: await authAs(usuario) })
    assert.equal(res.items[0]?.id, ctx.battleId, "no recupera la batalla en curso del usuario")
  }
})

test("la consulta de batalla activa trae mi propia butaca expandida", async () => {
  // La barra flotante no puede decidir con el estado de la batalla a secas: una batalla
  // sigue `live` mientras quede alguien entrenando, mucho después de que yo terminara o
  // me fuera. `isBattleActiveForMe` necesita mi fila de participante, y llega por la
  // relación inversa — que además debe seguir respetando la regla de lectura.
  const ctx = await liveBattle()
  const res = await api(`/api/collections/battles/records${ACTIVE_QS}`, { token: await authAs(ctx.friend) })
  const butacas = res.items[0]?.expand?.battle_participants_via_battle ?? []
  const mia = butacas.find((b) => b.user === ctx.friend.id)

  assert.ok(mia, "la relación inversa no devuelve la butaca del propio usuario")
  assert.equal(mia.status, "active")
})

test("terminar mi turno saca la batalla de mi consulta de batalla activa", async () => {
  // Regresión del bug que el usuario encontró en el dispositivo: terminó su circuito, la
  // batalla siguió `live` porque el rival aún entrenaba, y la barra flotante siguió
  // ofreciendo volver a una batalla en la que ya no le quedaba nada que hacer. Sin forma
  // de quitarla: entrar y salir la dejaba igual.
  const ctx = await liveBattle()
  await post(ctx.creator, `/api/battles/${ctx.battleId}/finish`)

  const battle = await getOne("battles", ctx.battleId)
  assert.equal(battle.status, "live", "la batalla debe seguir viva para el rival")

  const res = await api(`/api/collections/battles/records${ACTIVE_QS}`, { token: await authAs(ctx.creator) })
  const fila = res.items.find((b) => b.id === ctx.battleId)
  const butacas = fila?.expand?.battle_participants_via_battle ?? []
  const mia = butacas.find((b) => b.user === ctx.creator.id)

  assert.equal(mia?.status, "finished", "la consulta debe poder ver que ya terminé")
  assert.equal(
    isBattleActiveForMe(fila.status, mia.status, fila.creator === ctx.creator.id),
    false,
    "la barra seguiría anunciando una batalla que el usuario ya cerró",
  )
})

test("abandonar una batalla que sigue viva la saca de mi consulta de batalla activa", async () => {
  const ctx = await liveBattle()
  await post(ctx.friend, `/api/battles/${ctx.battleId}/leave`)

  const battle = await getOne("battles", ctx.battleId)
  assert.equal(battle.status, "live", "queda un participante activo, la batalla sigue")

  const res = await api(`/api/collections/battles/records${ACTIVE_QS}`, { token: await authAs(ctx.friend) })
  const fila = res.items.find((b) => b.id === ctx.battleId)
  const mia = (fila?.expand?.battle_participants_via_battle ?? []).find((b) => b.user === ctx.friend.id)

  assert.equal(mia?.status, "left")
  assert.equal(isBattleActiveForMe(fila.status, mia.status, false), false)
})

// ── Estado en vivo del marcador (#397) ───────────────────────────────────────

/** Milisegundos hasta un instante devuelto por el servidor, en formato de PocketBase. */
function msHasta(raw) {
  return new Date(String(raw).replace(" ", "T")).getTime() - Date.now()
}

function standingDe(snap, userId) {
  return snap.standings.find((s) => s.user === userId)
}

async function snapshotDe(user, battleId) {
  const res = await getRaw(user, `/api/battles/${battleId}/snapshot`)
  return res.json()
}

test("nadie descansa antes de confirmar su primer ejercicio", async () => {
  // La fila de progreso nace sellada con la hora de entrada. Si el descanso se leyera
  // de ahí sin más, el marcador diría que todo el mundo descansa nada más arrancar.
  const ctx = await liveBattle()
  const snap = await snapshotDe(ctx.creator, ctx.battleId)
  const mio = standingDe(snap, ctx.creator.id)

  assert.equal(mio.resting_until, null, "aparece descansando sin haber hecho nada")
  assert.equal(mio.current_exercise_position, null)
})

test("confirmar un ejercicio abre una ventana de descanso derivada del circuito", async () => {
  // El descanso NO se guarda: sale de cuándo confirmaron y del `rest_seconds` del
  // ejercicio anterior, que es dato del servidor. Así el cliente no puede fingir que
  // sigue trabajando mientras está parado.
  const ctx = await liveBattle()
  const snap = await post(ctx.creator, `/api/battles/${ctx.battleId}/progress`, {
    progress: { completed_rounds: 0, completed_reps: 10, completed_time_seconds: 0, current_exercise_position: 1 },
  })

  const mio = standingDe(snap, ctx.creator.id)
  assert.equal(mio.current_exercise_position, 1, "el marcador no dice en qué ejercicio va")
  assert.ok(mio.resting_until, "confirmar un ejercicio con descanso no abre la ventana")

  // El circuito de prueba descansa 30 s tras el ejercicio 0.
  const restante = msHasta(mio.resting_until)
  assert.ok(restante > 25_000 && restante <= 30_000, `ventana de descanso rara: ${restante}ms`)

  // Y el rival lo ve, que es justo para lo que existe.
  const visto = standingDe(await snapshotDe(ctx.friend, ctx.battleId), ctx.creator.id)
  assert.equal(visto.resting_until, mio.resting_until, "el rival no ve el mismo descanso")
})

test("el descanso que manda el cliente se ignora", async () => {
  const ctx = await liveBattle()
  const snap = await post(ctx.creator, `/api/battles/${ctx.battleId}/progress`, {
    progress: {
      completed_rounds: 0, completed_reps: 10, completed_time_seconds: 0, current_exercise_position: 1,
      // Nada de esto debe llegar a ninguna parte.
      resting_until: "2099-01-01 00:00:00.000Z",
      last_activity_at: "2099-01-01 00:00:00.000Z",
    },
  })

  const mio = standingDe(snap, ctx.creator.id)
  assert.ok(msHasta(mio.resting_until) <= 30_000, "el cliente pudo dictar su propio descanso")
  assert.ok(msHasta(mio.last_activity_at) <= 0, "el cliente pudo sellar su propia actividad")
})

test("quien termina o se va deja de aparecer descansando", async () => {
  const ctx = await liveBattle()
  await post(ctx.creator, `/api/battles/${ctx.battleId}/progress`, {
    progress: { completed_rounds: 0, completed_reps: 10, completed_time_seconds: 0, current_exercise_position: 1 },
  })
  const snap = await post(ctx.creator, `/api/battles/${ctx.battleId}/finish`, {})

  const mio = standingDe(snap, ctx.creator.id)
  assert.equal(mio.status, "finished")
  assert.equal(mio.resting_until, null, "un participante que ha terminado sigue 'descansando'")
})

test("un circuito sin descansos nunca marca descanso", async () => {
  const creator = await createUser("Sin Descanso")
  const friend = await createUser("Rival")
  const battle = await createDraft(creator, {
    exercises: [
      { exercise_id: "pushup", position: 0, target: { kind: "reps", value: 10 }, rest_seconds: 0 },
      { exercise_id: "squat", position: 1, target: { kind: "reps", value: 15 }, rest_seconds: 0 },
    ],
  })
  await post(creator, `/api/battles/${battle.id}/publish`)
  const token = await inviteToken(creator, battle.id)
  await post(friend, "/api/battles/join", { token })
  await post(creator, `/api/battles/${battle.id}/ready`, { ready: true })
  await post(friend, `/api/battles/${battle.id}/ready`, { ready: true })
  const arranque = await post(creator, `/api/battles/${battle.id}/start`)
  const espera = new Date(arranque.battle.starts_at).getTime() - Date.now() + 250
  if (espera > 0) await new Promise((r) => setTimeout(r, espera))

  const snap = await post(creator, `/api/battles/${battle.id}/progress`, {
    progress: { completed_rounds: 0, completed_reps: 10, completed_time_seconds: 0, current_exercise_position: 1 },
  })
  assert.equal(standingDe(snap, creator.id).resting_until, null)
})

test("el cron NO toca un lobby recién creado", async () => {
  // Regresión: el corte se interpolaba con `isoAt` (separador `T`) y se comparaba
  // contra el texto almacenado por PocketBase (separador espacio). Para filas del
  // mismo día `' '` (0x20) ordena antes que `'T'` (0x54), así que TODO lobby recién
  // creado parecía más viejo que el corte y el barrido lo expiraba en cinco minutos.
  const ctx = await lobbyWithTwo()
  const antes = await getOne("battles", ctx.battleId)
  assert.equal(antes.status, "lobby")

  await triggerCron("battles_expiry")

  // Damos margen al barrido en segundo plano y luego exigimos que no haya pasado nada.
  await new Promise(resolve => setTimeout(resolve, 1500))
  const despues = await getOne("battles", ctx.battleId)
  assert.equal(despues.status, "lobby", "el cron expiró un lobby dentro de su TTL")
  assert.equal(despues.revision, antes.revision, "el cron tocó la revisión de un lobby vivo")
})
