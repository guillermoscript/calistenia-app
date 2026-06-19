/// <reference path="../pb_data/types.d.ts" />

/**
 * notification_prefs — per-user notification preferences.
 *
 * One row per user. `push_enabled` is the master push toggle; the rest are
 * per-category opt-outs. Semantics are OPT-OUT: a missing row (or a missing
 * field) means "enabled". The server-side helper (pb_hooks/utils/notifications.js
 * → prefAllows) only suppresses a notification when the matching boolean is
 * explicitly false. The client (useNotificationPrefs) always writes the full
 * record so the booleans are explicit.
 *
 * Categories map from notification `type` in prefAllows():
 *   reactions            ← reaction
 *   comments             ← comment, comment_reply
 *   follows              ← follow
 *   challenges           ← challenge_invite, challenge_join, challenge_complete
 *   own_milestones       ← achievement, streak (your own)
 *   referrals            ← referral_signup, referral_bonus
 *   friend_workouts      ← friend_workout, friend_joined
 *   friend_streaks       ← friend_streak
 *   friend_achievements  ← friend_achievement
 */

function boolField(id, name) {
  return {
    "hidden": false,
    "id": id,
    "name": name,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool",
  }
}

migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_notification_prefs")
  } catch (e) {
    collection = new Collection({
      "createRule": "@request.auth.id != \"\" && @request.body.user = @request.auth.id",
      "deleteRule": "@request.auth.id != \"\" && user = @request.auth.id",
      "fields": [
        {
          "autogeneratePattern": "[a-z0-9]{15}",
          "hidden": false,
          "id": "text3208210256",
          "max": 15,
          "min": 15,
          "name": "id",
          "pattern": "^[a-z0-9]+$",
          "presentable": false,
          "primaryKey": true,
          "required": true,
          "system": true,
          "type": "text"
        },
        {
          "cascadeDelete": true,
          "collectionId": "_pb_users_auth_",
          "hidden": false,
          "id": "relation_np_user",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "user",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "relation"
        },
        boolField("bool_np_push_enabled", "push_enabled"),
        boolField("bool_np_reactions", "reactions"),
        boolField("bool_np_comments", "comments"),
        boolField("bool_np_follows", "follows"),
        boolField("bool_np_challenges", "challenges"),
        boolField("bool_np_own_milestones", "own_milestones"),
        boolField("bool_np_referrals", "referrals"),
        boolField("bool_np_friend_workouts", "friend_workouts"),
        boolField("bool_np_friend_streaks", "friend_streaks"),
        boolField("bool_np_friend_achievements", "friend_achievements")
      ],
      "id": "pbc_notification_prefs",
      "indexes": [
        "CREATE UNIQUE INDEX idx_np_user ON notification_prefs (user)"
      ],
      "listRule": "@request.auth.id != \"\" && user = @request.auth.id",
      "name": "notification_prefs",
      "system": false,
      "type": "base",
      "updateRule": "@request.auth.id != \"\" && user = @request.auth.id",
      "viewRule": "@request.auth.id != \"\" && user = @request.auth.id"
    })
  }

  return app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_notification_prefs")
    return app.delete(collection)
  } catch (e) {
    // Already deleted, ignore
  }
})
