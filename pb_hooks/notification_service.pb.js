/// <reference path="../pb_data/types.d.ts" />

/**
 * Notification service — centralized server-side notification creation.
 *
 * Creates in-app notifications and sends push notifications when
 * social events happen. Runs with admin access ($app), bypassing
 * API rules (notifications.createRule is null).
 *
 * To add a new notification type:
 * 1. Add a handler function below
 * 2. Register it with onRecordAfterCreateSuccess/onRecordAfterUpdateSuccess
 * 3. Add the type string to NotificationsPage.tsx getNotificationMessage/getNotificationRoute
 */

console.log("[notification_service] hook file loaded")

// ── Helpers ──────────────────────────────────────────────────────────────────

function getUserName(userId) {
  try {
    var user = $app.findRecordById("users", userId)
    return user.getString("display_name") || user.getString("name") || user.getString("email").split("@")[0] || ""
  } catch (e) {
    return ""
  }
}

function createSelfNotification(userId, type, referenceId, referenceType, data) {
  if (!userId) return
  try {
    var collection = $app.findCollectionByNameOrId("notifications")
    var notif = new Record(collection)
    notif.set("user", userId)
    notif.set("type", type)
    notif.set("actor", userId)
    notif.set("reference_id", referenceId)
    notif.set("reference_type", referenceType)
    notif.set("read", false)
    notif.set("data", JSON.stringify(data || {}))
    $app.save(notif)
  } catch (e) {
    console.log("[notif] self-create failed (type=" + type + "):", e)
  }
}

function createNotification(userId, type, actorId, referenceId, referenceType, data) {
  if (!userId || !actorId || userId === actorId) return
  try {
    var collection = $app.findCollectionByNameOrId("notifications")
    var notif = new Record(collection)
    notif.set("user", userId)
    notif.set("type", type)
    notif.set("actor", actorId)
    notif.set("reference_id", referenceId)
    notif.set("reference_type", referenceType)
    notif.set("read", false)
    notif.set("data", JSON.stringify(data || {}))
    $app.save(notif)
  } catch (e) {
    console.log("[notif] create failed (type=" + type + "):", e)
  }
}

function sendPush(userId, title, body, url) {
  try {
    var apiUrl = $os.getenv("AI_API_URL") || "http://localhost:3001"
    var internalKey = $os.getenv("INTERNAL_API_KEY") || ""
    var headers = { "Content-Type": "application/json" }
    if (internalKey) {
      headers["X-Internal-Key"] = internalKey
    }
    $http.send({
      url: apiUrl + "/api/send-push",
      method: "POST",
      headers: headers,
      body: JSON.stringify({ user_id: userId, title: title, body: body, url: url }),
      timeout: 10,
    })
  } catch (e) {
    console.log("[notif] push error:", e)
  }
}

// ── Follow notifications ─────────────────────────────────────────────────────

onRecordAfterCreateSuccess(function(e) {
  try {
    var followerId = e.record.getString("follower")
    var followingId = e.record.getString("following")

    if (!followerId || !followingId) return

    var followerName = getUserName(followerId)

    createNotification(
      followingId,
      "follow",
      followerId,
      followerId,
      "user",
      { followerName: followerName }
    )

    sendPush(
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

    var reactorName = getUserName(reactorId)

    createNotification(
      ownerId,
      "reaction",
      reactorId,
      sessionId,
      "session",
      { emoji: emoji, reactorName: reactorName }
    )

    sendPush(
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
    var authorId = e.record.getString("author")
    var sessionId = e.record.getString("session_id")
    var parentId = e.record.getString("parent_id")
    var commentBody = e.record.getString("body") || ""
    var preview = commentBody.length > 60 ? commentBody.substring(0, 60) + "..." : commentBody

    if (!authorId || !sessionId) return

    var authorName = getUserName(authorId)

    // If it's a reply, notify the parent comment's author
    if (parentId) {
      try {
        var parentComment = $app.findRecordById("comments", parentId)
        var parentAuthorId = parentComment.getString("author")
        if (parentAuthorId && parentAuthorId !== authorId) {
          createNotification(
            parentAuthorId,
            "comment_reply",
            authorId,
            sessionId,
            "session",
            { authorName: authorName, preview: preview }
          )
          sendPush(
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
          createNotification(
            ownerId,
            "comment",
            authorId,
            sessionId,
            "session",
            { authorName: authorName, preview: preview }
          )
          sendPush(
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

// ── Challenge join + invite notifications ────────────────────────────────────

onRecordAfterCreateSuccess(function(e) {
  try {
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
      var inviterName = getUserName(requestAuthId)

      createNotification(
        userId,
        "challenge_invite",
        requestAuthId,
        challengeId,
        "challenge",
        { inviterName: inviterName, challengeTitle: challengeTitle }
      )

      sendPush(
        userId,
        (inviterName || "Alguien") + " te invito a un desafio",
        challengeTitle,
        "/challenges/" + challengeId
      )
    }

    // Notify the challenge creator that someone joined
    if (!creatorId || creatorId === userId) return

    var userName = getUserName(userId)

    createNotification(
      creatorId,
      "challenge_join",
      userId,
      challengeId,
      "challenge",
      { userName: userName, challengeTitle: challengeTitle }
    )

    sendPush(
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
        createSelfNotification(uid, "challenge_complete", challengeId, "challenge", { challengeTitle: challengeTitle })
        sendPush(uid, "Desafio completado!", challengeTitle, "/challenges/" + challengeId)
      }
    }
    // Also notify creator if not already a participant
    if (creatorId && !notified[creatorId]) {
      createSelfNotification(creatorId, "challenge_complete", challengeId, "challenge", { challengeTitle: challengeTitle })
      sendPush(creatorId, "Desafio completado!", challengeTitle, "/challenges/" + challengeId)
    }
  } catch (err) {
    console.log("[notif] challenge_complete hook error:", err)
  }
}, "challenges")

// ── Achievement unlocked notifications ───────────────────────────────────────

onRecordAfterUpdateSuccess(function(e) {
  try {
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

    createSelfNotification(userId, "achievement", achievementId, "achievement", { achievementName: achievementName, achievementIcon: achievementIcon })
    sendPush(userId, achievementIcon + " " + achievementName, "Nuevo logro desbloqueado!", "/profile")
  } catch (err) {
    console.log("[notif] achievement hook error:", err)
  }
}, "user_achievements")

// ── Streak milestone notifications ───────────────────────────────────────────

var STREAK_MILESTONES = [7, 14, 30, 50, 100, 200, 365]

onRecordAfterUpdateSuccess(function(e) {
  try {
    var currentStreak = e.record.getInt("workout_streak_current")
    var oldStreak = e.record.original().getInt("workout_streak_current")

    if (currentStreak <= oldStreak) return

    var userId = e.record.getString("user")
    if (!userId) return

    for (var i = 0; i < STREAK_MILESTONES.length; i++) {
      var milestone = STREAK_MILESTONES[i]
      if (currentStreak >= milestone && oldStreak < milestone) {
        createSelfNotification(userId, "streak", String(milestone), "streak", { days: milestone })
        sendPush(userId, milestone + " dias seguidos!", "Tu racha de entrenamiento sigue creciendo", "/progress")
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

function checkReferralBonus(userId) {
  try {
    // Check if user was referred
    var referrals = $app.findRecordsByFilter(
      "referrals",
      "referred = '" + userId + "'",
      "",
      1,
      0
    )
    if (!referrals || referrals.length === 0) return

    var referrerId = referrals[0].getString("referrer")
    if (!referrerId) return

    // Check if this is the user's first session (count across all session types)
    var sessionCount = 0
    try {
      var sessions = $app.findRecordsByFilter("sessions", "user = '" + userId + "'", "", 2, 0)
      sessionCount += sessions.length
    } catch (err) { /* collection might not exist */ }
    try {
      var circuits = $app.findRecordsByFilter("circuit_sessions", "user = '" + userId + "'", "", 2, 0)
      sessionCount += circuits.length
    } catch (err) { /* collection might not exist */ }
    try {
      var cardio = $app.findRecordsByFilter("cardio_sessions", "user = '" + userId + "'", "", 2, 0)
      sessionCount += cardio.length
    } catch (err) { /* collection might not exist */ }

    // Only fire on the very first session (count === 1 because the record was just created)
    if (sessionCount !== 1) return

    var referredName = getUserName(userId)

    createNotification(
      referrerId,
      "referral_bonus",
      userId,
      userId,
      "user",
      { referredName: referredName }
    )

    sendPush(
      referrerId,
      "Tu referido completo su primer entrenamiento!",
      (referredName || "Tu referido") + " ya esta entrenando",
      "/referrals"
    )
  } catch (err) {
    console.log("[notif] referral_bonus error:", err)
  }
}

onRecordAfterCreateSuccess(function(e) {
  var userId = e.record.getString("user")
  if (userId) checkReferralBonus(userId)
}, "sessions")

onRecordAfterCreateSuccess(function(e) {
  var userId = e.record.getString("user")
  if (userId) checkReferralBonus(userId)
}, "circuit_sessions")

onRecordAfterCreateSuccess(function(e) {
  var userId = e.record.getString("user")
  if (userId) checkReferralBonus(userId)
}, "cardio_sessions")
