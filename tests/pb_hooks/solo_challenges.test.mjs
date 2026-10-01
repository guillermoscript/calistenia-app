/**
 * Retos en solitario con aviso diario (#805) — la parte de PocketBase real del
 * dispatcher `mcp-server/src/api/challenge-reminder-dispatcher.ts`.
 *
 * El dispatcher es TypeScript y sus tests unitarios usan un PB falso, que no
 * ejecuta los filtros. Aquí se comprueba, contra PB de verdad, lo que el falso
 * no puede:
 *   1. el filtro de candidatos (`challenge.status`/`challenge.preset_key` sobre
 *      la relación) y su `expand` devuelven los retos de catálogo ACTIVOS y
 *      solo esos, con los campos que el dispatcher lee;
 *   2. la marca de dedupe (`notifications.type = challenge_reminder`) se guarda
 *      con su `data` y ningún hook de notificaciones la convierte en un push
 *      social (el único push lo manda el dispatcher).
 * Si cambia el filtro del dispatcher, hay que cambiarlo aquí también.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  api, superToken, createUser, createAs, create, update, list,
  localDateString, resetPushes, pushesFor, sleep,
} from "./helpers/client.mjs"

// Mismo filtro y expand que `loadReminderCandidates`.
const CANDIDATE_FILTER = 'challenge.status = "active" && challenge.preset_key != ""'

async function candidatesOf(userId) {
  const qs = `?perPage=200&expand=challenge&filter=${encodeURIComponent(`(${CANDIDATE_FILTER}) && user = "${userId}"`)}`
  const res = await api(`/api/collections/challenge_participants/records${qs}`, { token: await superToken() })
  return res.items
}

function presetChallenge(user, over = {}) {
  return createAs(user, "challenges", {
    creator: user.id,
    title: "Tu primera dominada",
    metric: "most_pullups",
    exercise_slug: "",
    goal: 1,
    starts_at: localDateString(-2),
    ends_at: localDateString(177),
    status: "active",
    preset_key: "first_pullup",
    ...over,
  })
}

test("el filtro de candidatos trae el reto de catálogo activo con los campos que lee el dispatcher", async () => {
  const user = await createUser("Solo Dominada")
  const challenge = await presetChallenge(user)
  await createAs(user, "challenge_participants", { challenge: challenge.id, user: user.id })

  const rows = await candidatesOf(user.id)
  assert.equal(rows.length, 1)
  const ch = rows[0].expand.challenge
  assert.equal(ch.id, challenge.id)
  assert.equal(ch.preset_key, "first_pullup")
  assert.equal(ch.metric, "most_pullups")
  assert.equal(ch.goal, 1)
  assert.equal(ch.starts_at, localDateString(-2))
})

test("el filtro excluye retos sin preset_key y retos de catálogo ya terminados", async () => {
  const user = await createUser("Solo Filtro")

  const custom = await createAs(user, "challenges", {
    creator: user.id, title: "Reto libre", metric: "most_sessions",
    starts_at: localDateString(-1), ends_at: localDateString(5), status: "active",
  })
  await createAs(user, "challenge_participants", { challenge: custom.id, user: user.id })

  const ended = await presetChallenge(user, { preset_key: "starter_7_day", metric: "most_sessions", goal: 3 })
  await createAs(user, "challenge_participants", { challenge: ended.id, user: user.id })
  await update("challenges", ended.id, { status: "ended" })

  assert.deepEqual(await candidatesOf(user.id), [])
})

test("la marca challenge_reminder se guarda con su data y no dispara ningún push desde hooks", async () => {
  await resetPushes()
  const user = await createUser("Solo Marca")
  const challenge = await presetChallenge(user)

  await create("notifications", {
    user: user.id,
    type: "challenge_reminder",
    actor: user.id,
    reference_id: challenge.id,
    reference_type: "challenge",
    read: false,
    data: { url: "/workout", campaign: "challenge_reminder_first_pullup", challengeTitle: challenge.title, presetKey: "first_pullup" },
  })

  const [mark] = await list("notifications", `user = "${user.id}" && type = "challenge_reminder"`)
  assert.equal(mark.reference_id, challenge.id)
  assert.equal(mark.data.presetKey, "first_pullup")

  await sleep(300)
  assert.equal((await pushesFor(user.id)).length, 0, "el push lo manda el dispatcher, no un hook")
})
