/**
 * notification_service.pb.js — efectos al crear sesiones:
 * friend_joined (primera sesión de la vida) con anti-spam,
 * referral_bonus (primera sesión de un referido) y
 * racha/total_sessions server-side para circuit_sessions.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, createAs, create, update, getOne, list, waitFor,
  expectNotifications, localDateString,
} from "./helpers/client.mjs"

function makeSessionOn(user, day, key) {
  return createAs(user, "sessions", {
    user: user.id, workout_key: key, phase: 1, day: "day1", completed_at: `${day} 10:00:00`,
  })
}

function makeSession(user, key = "w1") {
  return createAs(user, "sessions", {
    user: user.id,
    workout_key: key,
    phase: 1,
    day: "day1",
    completed_at: "2026-07-21 10:00:00.000Z",
  })
}

test("primera sesión de la vida → friend_joined a seguidores, sin spam después", async () => {
  const athlete = await createUser("Atleta Nuevo")
  const fan = await createUser("Fan Atleta")
  await createAs(fan, "follows", { follower: fan.id, following: athlete.id })

  await makeSession(athlete)
  const [notif] = await expectNotifications(fan.id, "friend_joined", 1, "primera sesión → friend_joined")
  assert.equal(notif.actor, athlete.id)

  // Segunda sesión el mismo día: ni friend_joined ni friend_workout
  await makeSession(athlete, "w2")
  await expectNotifications(fan.id, "friend_joined", 1, "sin friend_joined duplicado")
  await expectNotifications(fan.id, "friend_workout", 0, "segunda sesión del día no notifica")
})

test("sin seguidores no genera notificaciones de workout", async () => {
  const loner = await createUser("Atleta Solitario")
  await makeSession(loner)
  await expectNotifications(loner.id, "friend_joined", 0, "sin seguidores → nada")
})

test("primera sesión de un referido → referral_bonus al referrer (solo una vez)", async () => {
  const referrer = await createUser("Referrer Bonus")
  const referred = await createUser("Referido Bonus")
  await createAs(referred, "referrals", {
    referrer: referrer.id,
    referred: referred.id,
    source: "quick_invite",
  })
  // El hook de referral creó follows mutuos → esperar a que existan para que
  // la primera sesión ya vea al referrer como seguidor.
  await waitFor(async () => {
    const rec = await getOne("users", referrer.id).catch(() => null)
    return rec !== null
  }, "setup listo")

  await makeSession(referred)
  const [notif] = await expectNotifications(referrer.id, "referral_bonus", 1, "bonus en primera sesión")
  assert.equal(notif.actor, referred.id)

  await makeSession(referred, "w2")
  await expectNotifications(referrer.id, "referral_bonus", 1, "sin bonus duplicado en la segunda")
})

/** Lunes de la semana de `day` ("YYYY-MM-DD"), con aritmetica UTC. */
function mondayOf(day) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/** Dia `dow` (0 = lunes) de la semana `weeks` semanas respecto a la actual. */
function weekDay(weeks, dow) {
  const d = new Date(`${mondayOf(localDateString(0))}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + weeks * 7 + dow)
  return d.toISOString().slice(0, 10)
}

function waitStats(userId, total, msg) {
  return waitFor(async () => {
    const [s] = await list("user_stats", `user='${userId}'`)
    return s && s.total_sessions === total ? s : null
  }, msg)
}

test("circuit_sessions actualiza total_sessions y la racha semanal server-side", async () => {
  // Racha de 1 semana (3 dias de la semana pasada, objetivo 3 por defecto).
  // Un circuito sin fechas cae al dia del servidor: la semana en curso.
  const user = await createUser("Circuitero")
  for (const dow of [0, 2, 4]) await makeSessionOn(user, weekDay(-1, dow), `pasada${dow}`)
  await waitStats(user.id, 3, "total 3")

  // 1ª del día: abre la semana de hoy, la racha sigue en 1, total 3→4
  await createAs(user, "circuit_sessions", { user: user.id, mode: "rounds", rounds_completed: 3 })
  const s4 = await waitStats(user.id, 4, "total 4")
  assert.equal(s4.workout_streak_current, 1, "la racha semanal sigue")
  assert.equal(s4.workout_streak_best, 1)
  assert.equal(s4.last_workout_date, localDateString(0))

  // 2ª del mismo día: total sube, racha no
  await createAs(user, "circuit_sessions", { user: user.id, mode: "rounds", rounds_completed: 2 })
  const s5 = await waitStats(user.id, 5, "total 5")
  assert.equal(s5.workout_streak_current, 1, "el mismo día no cumple la semana en curso")

  // Sube el objetivo a 4: la semana pasada deja de cumplirse → racha 0, y el
  // circuito siguiente demuestra que best no retrocede (se recalcula desde el
  // historial con el nuevo objetivo, pero nunca baja de la racha actual).
  const settings = await create("settings", { user: user.id, phase: 1 })
  await update("settings", settings.id, {
    weekly_goal_log: [{ from: localDateString(-60), goal: 4 }],
  })
  await waitFor(async () => {
    const s = await getOne("user_stats", s5.id)
    return s.workout_streak_current === 0 ? s : null
  }, "objetivo 4: la racha cae a 0")

  await createAs(user, "circuit_sessions", { user: user.id, mode: "rounds", rounds_completed: 1 })
  const s6 = await waitStats(user.id, 6, "total 6")
  assert.equal(s6.workout_streak_current, 0, "racha rota → 0")
  assert.ok(s6.workout_streak_best >= s6.workout_streak_current, "best nunca queda por debajo de current")
})
