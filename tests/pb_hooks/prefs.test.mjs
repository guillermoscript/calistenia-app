/**
 * utils/notifications.js prefAllows — modelo opt-out de notification_prefs:
 * categoría en false suprime in-app y push; push_enabled=false suprime solo push.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  createUser, createAs, expectNotifications, resetPushes, pushesFor, sleep,
} from "./helpers/client.mjs"

const ALL_ON = {
  push_enabled: true,
  reactions: true,
  comments: true,
  follows: true,
  challenges: true,
  own_milestones: true,
  referrals: true,
  friend_workouts: true,
  friend_streaks: true,
  friend_achievements: true,
}

test("categoría en false suprime in-app y push", async () => {
  await resetPushes()
  const target = await createUser("Sin Follows")
  const follower = await createUser("Fan Silenciado")
  await createAs(target, "notification_prefs", { user: target.id, ...ALL_ON, follows: false })

  await createAs(follower, "follows", { follower: follower.id, following: target.id })

  await expectNotifications(target.id, "follow", 0, "in-app suprimida por categoría")
  const pushed = await pushesFor(target.id)
  assert.equal(pushed.length, 0, "push suprimido por categoría")
})

test("push_enabled=false suprime solo el push, no la in-app", async () => {
  await resetPushes()
  const target = await createUser("Sin Push")
  const follower = await createUser("Fan InApp")
  await createAs(target, "notification_prefs", { user: target.id, ...ALL_ON, push_enabled: false })

  await createAs(follower, "follows", { follower: follower.id, following: target.id })

  await expectNotifications(target.id, "follow", 1, "in-app sí llega")
  await sleep(300) // margen para un push (incorrecto) en vuelo
  const pushed = await pushesFor(target.id)
  assert.equal(pushed.length, 0, "sin push con push_enabled=false")
})

test("sin registro de prefs todo llega (opt-out)", async () => {
  await resetPushes()
  const target = await createUser("Sin Prefs")
  const follower = await createUser("Fan Default")

  await createAs(follower, "follows", { follower: follower.id, following: target.id })

  await expectNotifications(target.id, "follow", 1, "in-app por defecto")
})
