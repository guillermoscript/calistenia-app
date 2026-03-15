/// <reference path="../pb_data/types.d.ts" />
/**
 * Security migration: harden updateRule on all user-owned collections.
 *
 * Problem: the previous updateRule was just `user = @request.auth.id`.
 * This allows an authenticated user to send { user: "<other_user_id>" }
 * in an update body and re-assign ownership of any record they own to
 * someone else — or for a bug to silently corrupt ownership.
 *
 * Fix: append `&& @request.body.user:isset = false` so that any request
 * that includes a `user` field in the body is rejected outright.
 *
 * Collections patched:
 *   - settings        pbc_2769025244
 *   - sessions        pbc_3660498186
 *   - sets_log        pbc_334236074
 *   - lumbar_checks   pbc_3725384270
 *   - user_programs   pbc_4176526388
 *
 * Also adds a missing composite index on sessions(user, workout_key)
 * which is used when filtering sessions by workout.
 */

migrate((app) => {
  const SECURE_RULE = "user = @request.auth.id && @request.body.user:isset = false"

  const targets = [
    "pbc_2769025244", // settings
    "pbc_3660498186", // sessions
    "pbc_334236074",  // sets_log
    "pbc_3725384270", // lumbar_checks
    "pbc_4176526388", // user_programs
  ]

  for (const id of targets) {
    try {
      const col = app.findCollectionByNameOrId(id)
      col.updateRule = SECURE_RULE
      app.save(col)
    } catch (e) {
      // Collection doesn't exist, skip
    }
  }

  // Add missing index on sessions(user, workout_key)
  try {
    const sessions = app.findCollectionByNameOrId("pbc_3660498186")
    const hasIdx = sessions.indexes.some(i => i.includes("idx_sessions_workout_key"))
    if (!hasIdx) {
      sessions.indexes = [
        ...sessions.indexes,
        "CREATE INDEX idx_sessions_workout_key ON sessions (user, workout_key)",
      ]
      app.save(sessions)
    }
  } catch (e) {
    // Collection doesn't exist, skip
  }

}, (app) => {
  // Rollback: restore previous (weaker) updateRule
  const OLD_RULE = "user = @request.auth.id"

  const targets = [
    "pbc_2769025244",
    "pbc_3660498186",
    "pbc_334236074",
    "pbc_3725384270",
    "pbc_4176526388",
  ]

  for (const id of targets) {
    try {
      const col = app.findCollectionByNameOrId(id)
      col.updateRule = OLD_RULE
      app.save(col)
    } catch (e) {
      // Collection doesn't exist, skip
    }
  }

  // Remove the added index
  try {
    const sessions = app.findCollectionByNameOrId("pbc_3660498186")
    sessions.indexes = sessions.indexes.filter(i => !i.includes("idx_sessions_workout_key"))
    app.save(sessions)
  } catch (e) {
    // Collection doesn't exist, skip
  }
})
