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
    workout_streak_current: 5,
    workout_streak_best: 5,
  })

  // 5 → 7: cruza el milestone de 7 días
  await update("user_stats", stats.id, { workout_streak_current: 7 })
  const [selfNotif] = await expectNotifications(user.id, "streak", 1, "milestone 7 días")
  assert.equal(selfNotif.reference_id, "7")
  assert.equal(selfNotif.data.days, 7)
  const [friendNotif] = await expectNotifications(fan.id, "friend_streak", 1, "fan-out friend_streak")
  assert.equal(friendNotif.actor, user.id)

  // 7 → 8: sin cruce de milestone → nada nuevo
  await update("user_stats", stats.id, { workout_streak_current: 8 })
  await expectNotifications(user.id, "streak", 1, "sin notif extra en 8")

  // 8 → 3: racha baja → nada
  await update("user_stats", stats.id, { workout_streak_current: 3 })
  await expectNotifications(user.id, "streak", 1, "racha rota no notifica")
})

test("racha que cruza varios milestones a la vez notifica solo el mayor (#260)", async () => {
  const user = await createUser("Atleta Salto")
  const fan = await createUser("Fan Salto")
  await createAs(fan, "follows", { follower: fan.id, following: user.id })

  const stats = await create("user_stats", {
    user: user.id,
    workout_streak_current: 5,
    workout_streak_best: 5,
  })

  // 5 → 20: cruza 7 y 14 en un solo update (recálculo server-side / sync
  // atrasado) → una sola notif, la del milestone mayor (14).
  await update("user_stats", stats.id, { workout_streak_current: 20 })
  const [selfNotif] = await expectNotifications(user.id, "streak", 1, "solo el milestone mayor")
  assert.equal(selfNotif.reference_id, "14")
  assert.equal(selfNotif.data.days, 14)
  const [friendNotif] = await expectNotifications(fan.id, "friend_streak", 1, "fan-out solo del mayor")
  assert.equal(friendNotif.data.days, 14)

  // 20 → 120: cruza 30, 50 y 100 → solo el 100
  await update("user_stats", stats.id, { workout_streak_current: 120 })
  const notifs = await expectNotifications(user.id, "streak", 2, "segundo salto notifica solo el 100")
  const days = notifs.map((n) => n.data.days).sort((a, b) => a - b)
  assert.deepEqual(days, [14, 100])
})
