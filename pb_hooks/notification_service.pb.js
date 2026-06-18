/// <reference path="../pb_data/types.d.ts" />

/**
 * Notification service — centralized server-side notification creation.
 *
 * Creates in-app notifications and sends push notifications when
 * social events happen. Runs with admin access ($app), bypassing
 * API rules (notifications.createRule is null).
 *
 * IMPORTANTE: cada handler corre en un runtime JSVM AISLADO y NO ve las
 * funciones top-level de este archivo. Por eso los helpers viven en
 * ./utils/notifications.js y cada handler hace
 *   require(`${__hooks}/utils/notifications.js`)
 * dentro de su cuerpo. (Antes eran globales → "ReferenceError: X is not defined"
 * en cada handler → atrapado (200 sin notif) o propagado (400). Ver utils/.)
 *
 * To add a new notification type:
 * 1. Add a handler function below (require the helpers inside its body)
 * 2. Register it with onRecordAfterCreateSuccess/onRecordAfterUpdateSuccess
 * 3. Add the type string to NotificationsPage.tsx getNotificationMessage/getNotificationRoute
 */

console.log("[notification_service] hook file loaded")

// ── Follow notifications ─────────────────────────────────────────────────────

onRecordAfterCreateSuccess(function(e) {
  try {
    var helpers = require(`${__hooks}/utils/notifications.js`)
    var followerId = e.record.getString("follower")
    var followingId = e.record.getString("following")

    if (!followerId || !followingId) return

    var followerName = helpers.getUserName(followerId)

    helpers.createNotification(
      followingId,
      "follow",
      followerId,
      followerId,
      "user",
      { followerName: followerName }
    )

    helpers.sendPush(
      followingId,
      (followerName || "Alguien") + " te sigue",
      "Tienes un nuevo seguidor",
      "/u/" + followerId
    )
  } catch (err) {
    console.log("[notif] follow hook error:", err)
  }
}, "follows")

// ── Reaction notifications ───────────────────────────────────────────────────

onRecordAfterCreateSuccess(function(e) {
  try {
    var helpers = require(`${__hooks}/utils/notifications.js`)
    var reactorId = e.record.getString("reactor")
    var sessionId = e.record.getString("session_id")
    var emoji = e.record.getString("emoji") || "🔥"

    if (!reactorId || !sessionId) return

    var ownerId = ""
    try {
      var session = $app.findRecordById("sessions", sessionId)
      ownerId = session.getString("user")
    } catch (err) {
      return
    }

    if (!ownerId || ownerId === reactorId) return

    var reactorName = helpers.getUserName(reactorId)

    helpers.createNotification(
      ownerId,
      "reaction",
      reactorId,
      sessionId,
      "session",
      { emoji: emoji, reactorName: reactorName }
    )

    helpers.sendPush(
      ownerId,
      (reactorName || "Alguien") + " " + emoji,
      "Reacciono a tu sesion",
      "/feed"
    )
  } catch (err) {
    console.log("[notif] reaction hook error:", err)
  }
}, "feed_reactions")

// ── Comment notifications ────────────────────────────────────────────────────

onRecordAfterCreateSuccess(function(e) {
  try {
    var helpers = require(`${__hooks}/utils/notifications.js`)
    var authorId = e.record.getString("author")
    var sessionId = e.record.getString("session_id")
    var parentId = e.record.getString("parent_id")
    var commentBody = e.record.getString("text") || ""
    var preview = commentBody.length > 60 ? commentBody.substring(0, 60) + "..." : commentBody

    if (!authorId || !sessionId) return

    var authorName = helpers.getUserName(authorId)

    // If it's a reply, notify the parent comment's author
    if (parentId) {
      try {
        var parentComment = $app.findRecordById("comments", parentId)
        var parentAuthorId = parentComment.getString("author")
        if (parentAuthorId && parentAuthorId !== authorId) {
          helpers.createNotification(
            parentAuthorId,
            "comment_reply",
            authorId,
            sessionId,
            "session",
            { authorName: authorName, preview: preview }
          )
          helpers.sendPush(
            parentAuthorId,
            (authorName || "Alguien") + " respondio tu comentario",
            preview,
            "/feed"
          )
        }
      } catch (err) { /* parent not found */ }
    }

    // Notify the session owner
    try {
      var session = $app.findRecordById("sessions", sessionId)
      var ownerId = session.getString("user")
      if (ownerId && ownerId !== authorId) {
        // Avoid double notification if owner is also the parent comment author
        var skipOwner = false
        if (parentId) {
          try {
            var pc = $app.findRecordById("comments", parentId)
            if (pc.getString("author") === ownerId) skipOwner = true
          } catch (err) { /* ignore */ }
        }
        if (!skipOwner) {
          helpers.createNotification(
            ownerId,
            "comment",
            authorId,
            sessionId,
            "session",
            { authorName: authorName, preview: preview }
          )
          helpers.sendPush(
            ownerId,
            (authorName || "Alguien") + " comento tu sesion",
            preview,
            "/feed"
          )
        }
      }
    } catch (err) { /* session not found */ }
  } catch (err) {
    console.log("[notif] comment hook error:", err)
  }
}, "comments")

// ── Comment reaction notifications ──────────────────────────────────────────

onRecordAfterCreateSuccess(function(e) {
  try {
    const helpers = require(`${__hooks}/utils/notifications.js`)
    const reactorId = e.record.getString("reactor")
    const commentId = e.record.getString("comment_id")
    const emoji = e.record.getString("emoji") || "❤️"

    if (!reactorId || !commentId) return

    let authorId = ""
    try {
      const comment = $app.findRecordById("comments", commentId)
      authorId = comment.getString("author")
    } catch (err) {
      return
    }

    if (!authorId || authorId === reactorId) return

    const reactorName = helpers.getUserName(reactorId)

    helpers.createNotification(
      authorId,
      "reaction",
      reactorId,
      commentId,
      "comment",
      { emoji: emoji, reactorName: reactorName }
    )

    helpers.sendPush(
      authorId,
      (reactorName || "Alguien") + " " + emoji,
      "Reaccionó a tu comentario",
      "/feed"
    )
  } catch (err) {
    console.log("[notif] comment_reaction hook error:", err)
  }
}, "comment_reactions")

// ── Challenge join + invite notifications ────────────────────────────────────

onRecordAfterCreateSuccess(function(e) {
  try {
    var helpers = require(`${__hooks}/utils/notifications.js`)
    var userId = e.record.getString("user")
    var challengeId = e.record.getString("challenge")

    if (!userId || !challengeId) return

    var creatorId = ""
    var challengeTitle = ""
    try {
      var challenge = $app.findRecordById("challenges", challengeId)
      creatorId = challenge.getString("creator")
      challengeTitle = challenge.getString("title") || "un desafio"
    } catch (err) {
      return
    }

    // Determine who made the API call (inviter vs self-join)
    var requestAuthId = ""
    try {
      var info = e.requestInfo()
      if (info && info.auth) requestAuthId = info.auth.id || ""
    } catch (err) { /* pre-0.36 or internal call */ }

    // If someone else added this participant → notify the invited user
    if (requestAuthId && requestAuthId !== userId) {
      var inviterName = helpers.getUserName(requestAuthId)

      helpers.createNotification(
        userId,
        "challenge_invite",
        requestAuthId,
        challengeId,
        "challenge",
        { inviterName: inviterName, challengeTitle: challengeTitle }
      )

      helpers.sendPush(
        userId,
        (inviterName || "Alguien") + " te invito a un desafio",
        challengeTitle,
        "/challenges/" + challengeId
      )
    }

    // Notify the challenge creator that someone joined
    if (!creatorId || creatorId === userId) return

    var userName = helpers.getUserName(userId)

    helpers.createNotification(
      creatorId,
      "challenge_join",
      userId,
      challengeId,
      "challenge",
      { userName: userName, challengeTitle: challengeTitle }
    )

    helpers.sendPush(
      creatorId,
      (userName || "Alguien") + " se unio a tu desafio",
      challengeTitle,
      "/challenges/" + challengeId
    )
  } catch (err) {
    console.log("[notif] challenge_join hook error:", err)
  }
}, "challenge_participants")

// ── Challenge complete notifications ─────────────────────────────────────────

onRecordAfterUpdateSuccess(function(e) {
  try {
    var helpers = require(`${__hooks}/utils/notifications.js`)
    var status = e.record.getString("status")
    var oldStatus = e.record.original().getString("status")

    if (status !== "completed" || oldStatus === "completed") return

    var challengeId = e.record.getId()
    var creatorId = e.record.getString("creator")
    var challengeTitle = e.record.getString("title") || "Desafio"

    var participants = []
    try {
      participants = $app.findRecordsByFilter(
        "challenge_participants",
        "challenge = \"" + challengeId + "\"",
        "",
        100,
        0
      )
    } catch (err) {
      return
    }

    // Collect all user IDs
    var notified = {}
    for (var i = 0; i < participants.length; i++) {
      var uid = participants[i].getString("user")
      if (uid && !notified[uid]) {
        notified[uid] = true
        helpers.createSelfNotification(uid, "challenge_complete", challengeId, "challenge", { challengeTitle: challengeTitle })
        helpers.sendPush(uid, "Desafio completado!", challengeTitle, "/challenges/" + challengeId)
      }
    }
    // Also notify creator if not already a participant
    if (creatorId && !notified[creatorId]) {
      helpers.createSelfNotification(creatorId, "challenge_complete", challengeId, "challenge", { challengeTitle: challengeTitle })
      helpers.sendPush(creatorId, "Desafio completado!", challengeTitle, "/challenges/" + challengeId)
    }
  } catch (err) {
    console.log("[notif] challenge_complete hook error:", err)
  }
}, "challenges")

// ── Achievement unlocked notifications ───────────────────────────────────────

onRecordAfterUpdateSuccess(function(e) {
  try {
    var helpers = require(`${__hooks}/utils/notifications.js`)
    var unlocked = e.record.getBool("unlocked")
    var wasUnlocked = e.record.original().getBool("unlocked")

    if (!unlocked || wasUnlocked) return

    var userId = e.record.getString("user")
    var achievementId = e.record.getString("achievement")

    if (!userId || !achievementId) return

    var achievementName = ""
    var achievementIcon = ""
    try {
      var achievement = $app.findRecordById("achievements", achievementId)
      achievementName = achievement.getString("name") || "Logro"
      achievementIcon = achievement.getString("icon") || "🏅"
    } catch (err) {
      return
    }

    helpers.createSelfNotification(userId, "achievement", achievementId, "achievement", { achievementName: achievementName, achievementIcon: achievementIcon })
    helpers.sendPush(userId, achievementIcon + " " + achievementName, "Nuevo logro desbloqueado!", "/profile")
  } catch (err) {
    console.log("[notif] achievement hook error:", err)
  }
}, "user_achievements")

// ── Streak milestone notifications ───────────────────────────────────────────

onRecordAfterUpdateSuccess(function(e) {
  try {
    var helpers = require(`${__hooks}/utils/notifications.js`)
    var STREAK_MILESTONES = [7, 14, 30, 50, 100, 200, 365]

    var currentStreak = e.record.getInt("workout_streak_current")
    var oldStreak = e.record.original().getInt("workout_streak_current")

    if (currentStreak <= oldStreak) return

    var userId = e.record.getString("user")
    if (!userId) return

    for (var i = 0; i < STREAK_MILESTONES.length; i++) {
      var milestone = STREAK_MILESTONES[i]
      if (currentStreak >= milestone && oldStreak < milestone) {
        helpers.createSelfNotification(userId, "streak", String(milestone), "streak", { days: milestone })
        helpers.sendPush(userId, milestone + " dias seguidos!", "Tu racha de entrenamiento sigue creciendo", "/progress")
        break
      }
    }
  } catch (err) {
    console.log("[notif] streak hook error:", err)
  }
}, "user_stats")

// ── Circuit session streak + total_sessions update ──────────────────────────
// When a circuit_sessions record is created, update user_stats:
// - Increment total_sessions
// - Update workout_streak_current using date-checking logic
//
// NOTE: There is no existing hook for regular `sessions` that does this —
// the same pattern should be added for `sessions` and `cardio_sessions`
// when those collections need server-side streak tracking.
// (No usa helpers externos — solo $app inline — así que funciona tal cual.)

onRecordAfterCreateSuccess(function(e) {
  try {
    var userId = e.record.getString("user")
    if (!userId) return

    var stats = null
    try {
      var records = $app.findRecordsByFilter(
        "user_stats",
        "user = '" + userId + "'",
        "",
        1,
        0
      )
      if (records && records.length > 0) {
        stats = records[0]
      }
    } catch (err) {
      console.log("[circuit_streak] user_stats lookup failed:", err)
      return
    }

    if (!stats) {
      console.log("[circuit_streak] no user_stats record for user " + userId)
      return
    }

    // Increment total_sessions
    var totalSessions = stats.getInt("total_sessions") || 0
    stats.set("total_sessions", totalSessions + 1)

    // Update streak: check if last workout was yesterday or today
    var currentStreak = stats.getInt("workout_streak_current") || 0
    var bestStreak = stats.getInt("workout_streak_best") || 0
    var lastWorkoutDate = stats.getString("last_workout_date") || ""

    var now = new Date()
    var todayStr = now.getFullYear() + "-" +
      String(now.getMonth() + 1).padStart(2, "0") + "-" +
      String(now.getDate()).padStart(2, "0")

    if (lastWorkoutDate === todayStr) {
      // Already worked out today — no streak change, just save total_sessions
    } else {
      // Check if last workout was yesterday
      var yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      var yesterdayStr = yesterday.getFullYear() + "-" +
        String(yesterday.getMonth() + 1).padStart(2, "0") + "-" +
        String(yesterday.getDate()).padStart(2, "0")

      if (lastWorkoutDate === yesterdayStr) {
        currentStreak += 1
      } else {
        // Streak broken — start at 1
        currentStreak = 1
      }

      stats.set("workout_streak_current", currentStreak)
      if (currentStreak > bestStreak) {
        stats.set("workout_streak_best", currentStreak)
      }
      stats.set("last_workout_date", todayStr)
    }

    $app.save(stats)
  } catch (err) {
    console.log("[circuit_streak] hook error:", err)
  }
}, "circuit_sessions")

// ── Referral bonus notifications (first workout) ────────────────────────────
// When a referred user completes their first session, notify the referrer.
// checkReferralBonus vive en ./utils/notifications.js (require dentro del handler).

onRecordAfterCreateSuccess(function(e) {
  try {
    var helpers = require(`${__hooks}/utils/notifications.js`)
    var userId = e.record.getString("user")
    if (userId) helpers.checkReferralBonus(userId)
  } catch (err) {
    console.log("[notif] session referral hook error:", err)
  }
}, "sessions")

onRecordAfterCreateSuccess(function(e) {
  try {
    var helpers = require(`${__hooks}/utils/notifications.js`)
    var userId = e.record.getString("user")
    if (userId) helpers.checkReferralBonus(userId)
  } catch (err) {
    console.log("[notif] circuit referral hook error:", err)
  }
}, "circuit_sessions")

onRecordAfterCreateSuccess(function(e) {
  try {
    var helpers = require(`${__hooks}/utils/notifications.js`)
    var userId = e.record.getString("user")
    if (userId) helpers.checkReferralBonus(userId)
  } catch (err) {
    console.log("[notif] cardio referral hook error:", err)
  }
}, "cardio_sessions")
