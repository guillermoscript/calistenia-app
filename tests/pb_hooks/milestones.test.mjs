/**
 * notification_service.pb.js — hitos propios con fan-out a seguidores:
 * achievement desbloqueado (self + friend_achievement) y
 * racha cruzando milestone (self + friend_streak).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, createAs, create, update, uniq, expectNotifications,
} from "./helpers/client.mjs"

test("achievement desbloqueado: self-notif + fan-out friend_achievement", async () => {
  const user = await createUser("Atleta Logro")
  const fan = await createUser("Fan Logro")
  await createAs(fan, "follows", { follower: fan.id, following: user.id })

  const achievement = await create("achievements", {
    key: uniq("test_achv"),
    category: "workout",
    tier: "bronze",
    requirement_type: "sessions",
    requirement_value: 1,
    xp_reward: 10,
    icon: "🏅",
    name: { es: "Primer Paso" },
  })
  const ua = await create("user_achievements", {
    user: user.id,
    achievement: achievement.id,
    progress: 0,
    unlocked: false,
  })

  await update("user_achievements", ua.id, { unlocked: true, progress: 100 })

  const [selfNotif] = await expectNotifications(user.id, "achievement", 1, "self-notif de logro")
  // name es un campo json i18n: getString puede devolver el JSON crudo o "" con
  // fallback "Logro" — solo assertamos que llegó algo y el icono exacto.
  assert.ok(selfNotif.data.achievementName)
  assert.equal(selfNotif.data.achievementIcon, "🏅")
  const [friendNotif] = await expectNotifications(fan.id, "friend_achievement", 1, "fan-out a seguidores")
  assert.equal(friendNotif.actor, user.id)

  // Update sin transición (ya estaba unlocked) → no re-notifica
  await update("user_achievements", ua.id, { progress: 100 })
  await expectNotifications(user.id, "achievement", 1, "sin re-notificación")
})

test("racha que cruza un milestone notifica y hace fan-out; sin cruce no", async () => {
  const user = await createUser("Atleta Racha")
  const fan = await createUser("Fan Racha")
  await createAs(fan, "follows", { follower: fan.id, following: user.id })

  const stats = await create("user_stats", {
    user: user.id,
    workout_streak_current: 3,
    workout_streak_best: 3,
  })

  // 3 → 4: cruza el milestone de 4 semanas (#801: la racha es semanal)
  await update("user_stats", stats.id, { workout_streak_current: 4 })
  const [selfNotif] = await expectNotifications(user.id, "streak", 1, "milestone 4 semanas")
  assert.equal(selfNotif.reference_id, "4")
  assert.equal(selfNotif.data.weeks, 4)
  assert.equal(selfNotif.data.days, undefined, "ya no se manda en dias")
  const [friendNotif] = await expectNotifications(fan.id, "friend_streak", 1, "fan-out friend_streak")
  assert.equal(friendNotif.actor, user.id)
  assert.equal(friendNotif.data.weeks, 4)

  // 4 → 5: sin cruce de milestone → nada nuevo
  await update("user_stats", stats.id, { workout_streak_current: 5 })
  await expectNotifications(user.id, "streak", 1, "sin notif extra en 5")

  // 5 → 7: todavia sin cruzar el 8
  await update("user_stats", stats.id, { workout_streak_current: 7 })
  await expectNotifications(user.id, "streak", 1, "sin notif extra en 7")

  // 7 → 8: el siguiente milestone
  await update("user_stats", stats.id, { workout_streak_current: 8 })
  const notifs = await expectNotifications(user.id, "streak", 2, "milestone 8 semanas")
  const weeks = notifs.map((n) => n.data.weeks).sort((a, b) => a - b)
  assert.deepEqual(weeks, [4, 8])

  // 8 → 1: racha baja → nada
  await update("user_stats", stats.id, { workout_streak_current: 1 })
  await expectNotifications(user.id, "streak", 2, "racha rota no notifica")
})

test("racha que cruza varios milestones a la vez notifica solo el mayor (#260)", async () => {
  const user = await createUser("Atleta Salto")
  const fan = await createUser("Fan Salto")
  await createAs(fan, "follows", { follower: fan.id, following: user.id })

  const stats = await create("user_stats", {
    user: user.id,
    workout_streak_current: 1,
    workout_streak_best: 1,
  })

  // 1 → 5: cruza el 4 en un solo update (recálculo server-side / sync
  // atrasado) → una sola notif, la del milestone mayor (4).
  await update("user_stats", stats.id, { workout_streak_current: 5 })
  const [selfNotif] = await expectNotifications(user.id, "streak", 1, "solo el milestone mayor")
  assert.equal(selfNotif.reference_id, "4")
  assert.equal(selfNotif.data.weeks, 4)
  const [friendNotif] = await expectNotifications(fan.id, "friend_streak", 1, "fan-out solo del mayor")
  assert.equal(friendNotif.data.weeks, 4)

  // 5 → 30: cruza 8, 12 y 26 → solo el 26
  await update("user_stats", stats.id, { workout_streak_current: 30 })
  const notifs = await expectNotifications(user.id, "streak", 2, "segundo salto notifica solo el 26")
  const weeks = notifs.map((n) => n.data.weeks).sort((a, b) => a - b)
  assert.deepEqual(weeks, [4, 26])

  // 30 → 60: cruza 52 → solo el 52
  await update("user_stats", stats.id, { workout_streak_current: 60 })
  const all = await expectNotifications(user.id, "streak", 3, "tercer salto notifica solo el 52")
  assert.deepEqual(all.map((n) => n.data.weeks).sort((a, b) => a - b), [4, 26, 52])
  const friends = await expectNotifications(fan.id, "friend_streak", 3, "fan-out de cada salto")
  assert.ok(friends.some((n) => n.data.weeks === 52))
})
