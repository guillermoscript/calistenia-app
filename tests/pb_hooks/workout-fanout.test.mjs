/**
 * notification_service.pb.js — efectos al crear sesiones:
 * friend_joined (primera sesión de la vida) con anti-spam,
 * referral_bonus (primera sesión de un referido) y
 * racha/total_sessions server-side para circuit_sessions.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, createAs, create, update, getOne, waitFor,
  expectNotifications, localDateString,
} from "./helpers/client.mjs"

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

test("circuit_sessions actualiza total_sessions y la racha server-side", async () => {
  const user = await createUser("Circuitero")
  const stats = await create("user_stats", {
    user: user.id,
    total_sessions: 5,
    workout_streak_current: 3,
    workout_streak_best: 3,
    last_workout_date: localDateString(-1), // ayer → la racha continúa
  })

  // 1ª del día: racha 3→4, total 5→6
  await createAs(user, "circuit_sessions", { user: user.id, mode: "rounds", rounds_completed: 3 })
  await waitFor(async () => {
    const s = await getOne("user_stats", stats.id)
    return s.total_sessions === 6 && s.workout_streak_current === 4 ? s : null
  }, "racha continúa: 3→4, total 6").then((s) => {
    assert.equal(s.workout_streak_best, 4, "best acompaña a current")
    assert.equal(s.last_workout_date, localDateString(0))
  })

  // 2ª del mismo día: total sube, racha no
  await createAs(user, "circuit_sessions", { user: user.id, mode: "rounds", rounds_completed: 2 })
  await waitFor(async () => {
    const s = await getOne("user_stats", stats.id)
    return s.total_sessions === 7 ? s : null
  }, "total 7").then((s) => {
    assert.equal(s.workout_streak_current, 4, "misma racha el mismo día")
  })

  // Racha rota (último workout hace mucho): reinicia en 1, best se conserva
  await update("user_stats", stats.id, { last_workout_date: "2020-01-01" })
  await createAs(user, "circuit_sessions", { user: user.id, mode: "rounds", rounds_completed: 1 })
  await waitFor(async () => {
    const s = await getOne("user_stats", stats.id)
    return s.total_sessions === 8 && s.workout_streak_current === 1 ? s : null
  }, "racha rota → 1").then((s) => {
    assert.equal(s.workout_streak_best, 4, "best no retrocede")
  })
})
