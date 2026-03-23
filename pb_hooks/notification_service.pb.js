/// <reference path="../pb_data/types.d.ts" />

/**
 * Notification service — centralized server-side notification creation.
 *
 * Creates in-app notifications and sends push notifications when
 * social events happen. Runs with admin access ($app), bypassing
 * API rules (notifications.createRule is null).
 *
 * To add a new notification type:
 * 1. Add a handler function below (e.g., notifyChallenge)
 * 2. Register it with onRecordAfterCreateSuccess for the collection
 * 3. Add the type string to NotificationsPage.tsx NOTIF_CONFIG
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function getUserName(userId) {
  try {
    const user = $app.findRecordById("users", userId)
    return user.getString("display_name") || user.getString("name") || user.getString("email").split("@")[0] || ""
  } catch (e) {
    return ""
  }
}

/**
 * Create a self-notification (achievements, streaks — actor = user).
 * Skips the self-notify guard.
 */
function createSelfNotification(userId, type, referenceId, referenceType, data) {
  if (!userId) return
  try {
    const collection = $app.findCollectionByNameOrId("notifications")
    const notif = new Record(collection)
    notif.set("user", userId)
    notif.set("type", type)
    notif.set("actor", userId)
    notif.set("reference_id", referenceId)
    notif.set("reference_type", referenceType)
    notif.set("read", false)
    notif.set("data", JSON.stringify(data || {}))
    $app.save(notif)
  } catch (e) {
    console.log(`[notif] self-create failed (type=${type}):`, e)
  }
}

function createNotification(userId, type, actorId, referenceId, referenceType, data) {
  if (!userId || !actorId || userId === actorId) return // Don't notify yourself

  try {
    const collection = $app.findCollectionByNameOrId("notifications")
    const notif = new Record(collection)
    notif.set("user", userId)
    notif.set("type", type)
    notif.set("actor", actorId)
    notif.set("reference_id", referenceId)
    notif.set("reference_type", referenceType)
    notif.set("read", false)
    notif.set("data", JSON.stringify(data || {}))
    $app.save(notif)
  } catch (e) {
    console.log(`[notif] create failed (type=${type}):`, e)
  }
}

function sendPush(userId, title, body, url) {
  try {
    const apiUrl = $os.getenv("AI_API_URL") || "http://localhost:3001"
    const internalKey = $os.getenv("INTERNAL_API_KEY") || ""
    const headers = { "Content-Type": "application/json" }
    if (internalKey) {
      headers["X-Internal-Key"] = internalKey
    }
    $http.send({
      url: `${apiUrl}/api/send-push`,
      method: "POST",
      headers: headers,
      body: JSON.stringify({ user_id: userId, title, body, url }),
      timeout: 10,
    })
  } catch (e) {
    console.log("[notif] push error:", e)
  }
}

// ── Follow notifications ─────────────────────────────────────────────────────

onRecordAfterCreateSuccess((e) => {
  const followerId = e.record.getString("follower")
  const followingId = e.record.getString("following")

  if (!followerId || !followingId) return

  const followerName = getUserName(followerId)

  createNotification(
    followingId,        // recipient: the person being followed
    "follow",
    followerId,         // actor: the person who followed
    followerId,         // reference_id: link to follower's profile
    "user",
    { followerName }
  )

  sendPush(
    followingId,
    `${followerName || "Alguien"} te sigue`,
    "Tienes un nuevo seguidor",
    `/u/${followerId}`
  )
}, "follows")

// ── Reaction notifications ───────────────────────────────────────────────────

onRecordAfterCreateSuccess((e) => {
  const reactorId = e.record.getString("reactor")
  const sessionId = e.record.getString("session_id")
  const emoji = e.record.getString("emoji") || "🔥"

  if (!reactorId || !sessionId) return

  // Find the session owner
  let ownerId = ""
  try {
    const session = $app.findRecordById("sessions", sessionId)
    ownerId = session.getString("user")
  } catch (e) {
    return
  }

  if (!ownerId || ownerId === reactorId) return

  const reactorName = getUserName(reactorId)

  createNotification(
    ownerId,
    "reaction",
    reactorId,
    sessionId,
    "session",
    { emoji, reactorName }
  )

  sendPush(
    ownerId,
    `${reactorName || "Alguien"} ${emoji}`,
    "Reacciono a tu sesion",
    "/feed"
  )
}, "feed_reactions")

// ── Comment notifications ────────────────────────────────────────────────────

onRecordAfterCreateSuccess((e) => {
  const authorId = e.record.getString("author")
  const sessionId = e.record.getString("session_id")
  const parentId = e.record.getString("parent_id")
  const body = e.record.getString("body") || ""
  const preview = body.length > 60 ? body.substring(0, 60) + "..." : body

  if (!authorId || !sessionId) return

  const authorName = getUserName(authorId)

  // If it's a reply, notify the parent comment's author
  if (parentId) {
    try {
      const parentComment = $app.findRecordById("comments", parentId)
      const parentAuthorId = parentComment.getString("author")
      if (parentAuthorId && parentAuthorId !== authorId) {
        createNotification(
          parentAuthorId,
          "comment_reply",
          authorId,
          sessionId,
          "session",
          { authorName, preview }
        )
        sendPush(
          parentAuthorId,
          `${authorName || "Alguien"} respondio tu comentario`,
          preview,
          "/feed"
        )
      }
    } catch (e) { /* parent not found */ }
  }

  // Notify the session owner (if different from commenter and parent author)
  try {
    const session = $app.findRecordById("sessions", sessionId)
    const ownerId = session.getString("user")
    if (ownerId && ownerId !== authorId) {
      // Avoid double notification if owner is also the parent comment author
      if (!parentId || (() => {
        try {
          const parentComment = $app.findRecordById("comments", parentId)
          return parentComment.getString("author") !== ownerId
        } catch (e) { return true }
      })()) {
        createNotification(
          ownerId,
          "comment",
          authorId,
          sessionId,
          "session",
          { authorName, preview }
        )
        sendPush(
          ownerId,
          `${authorName || "Alguien"} comento tu sesion`,
          preview,
          "/feed"
        )
      }
    }
  } catch (e) { /* session not found */ }
}, "comments")

// ── Challenge join notifications ─────────────────────────────────────────────

onRecordAfterCreateSuccess((e) => {
  const userId = e.record.getString("user")
  const challengeId = e.record.getString("challenge")

  if (!userId || !challengeId) return

  // Find the challenge creator
  let creatorId = ""
  let challengeTitle = ""
  try {
    const challenge = $app.findRecordById("challenges", challengeId)
    creatorId = challenge.getString("creator")
    challengeTitle = challenge.getString("title") || "un desafio"
  } catch (e) {
    return
  }

  if (!creatorId || creatorId === userId) return

  const userName = getUserName(userId)

  createNotification(
    creatorId,
    "challenge_join",
    userId,
    challengeId,
    "challenge",
    { userName, challengeTitle }
  )

  sendPush(
    creatorId,
    `${userName || "Alguien"} se unio a tu desafio`,
    challengeTitle,
    `/challenges/${challengeId}`
  )
}, "challenge_participants")

// ── Challenge complete notifications ─────────────────────────────────────────
// Fires when the challenge status is updated to "completed"

onRecordAfterUpdateSuccess((e) => {
  const status = e.record.getString("status")
  const oldStatus = e.record.original().getString("status")

  // Only fire when status changes TO completed
  if (status !== "completed" || oldStatus === "completed") return

  const challengeId = e.record.getId()
  const creatorId = e.record.getString("creator")
  const challengeTitle = e.record.getString("title") || "Desafio"

  // Get all participants
  let participants = []
  try {
    participants = $app.findRecordsByFilter(
      "challenge_participants",
      `challenge = "${challengeId}"`,
      "",
      100,
      0
    )
  } catch (e) {
    return
  }

  // Notify all participants (including creator)
  const allUserIds = participants.map(function(p) { return p.getString("user") })
  if (creatorId && !allUserIds.includes(creatorId)) {
    allUserIds.push(creatorId)
  }

  for (const uid of allUserIds) {
    createSelfNotification(
      uid,
      "challenge_complete",
      challengeId,
      "challenge",
      { challengeTitle }
    )

    sendPush(
      uid,
      "Desafio completado!",
      challengeTitle,
      `/challenges/${challengeId}`
    )
  }
}, "challenges")

// ── Achievement unlocked notifications ───────────────────────────────────────

onRecordAfterUpdateSuccess((e) => {
  const unlocked = e.record.getBool("unlocked")
  const wasUnlocked = e.record.original().getBool("unlocked")

  // Only fire when unlocked changes from false to true
  if (!unlocked || wasUnlocked) return

  const userId = e.record.getString("user")
  const achievementId = e.record.getString("achievement")

  if (!userId || !achievementId) return

  // Get achievement details
  let achievementName = ""
  let achievementIcon = ""
  try {
    const achievement = $app.findRecordById("achievements", achievementId)
    achievementName = achievement.getString("name") || "Logro"
    achievementIcon = achievement.getString("icon") || "🏅"
  } catch (e) {
    return
  }

  createSelfNotification(
    userId,
    "achievement",
    achievementId,
    "achievement",
    { achievementName, achievementIcon }
  )

  sendPush(
    userId,
    `${achievementIcon} ${achievementName}`,
    "Nuevo logro desbloqueado!",
    "/profile"
  )
}, "user_achievements")

// ── Streak milestone notifications ───────────────────────────────────────────

const STREAK_MILESTONES = [7, 14, 30, 50, 100, 200, 365]

onRecordAfterUpdateSuccess((e) => {
  const currentStreak = e.record.getInt("workout_streak_current")
  const oldStreak = e.record.original().getInt("workout_streak_current")

  // Only fire when streak increases
  if (currentStreak <= oldStreak) return

  const userId = e.record.getString("user")
  if (!userId) return

  // Check if we crossed a milestone
  for (const milestone of STREAK_MILESTONES) {
    if (currentStreak >= milestone && oldStreak < milestone) {
      createSelfNotification(
        userId,
        "streak",
        String(milestone),
        "streak",
        { days: milestone }
      )

      sendPush(
        userId,
        `${milestone} dias seguidos!`,
        "Tu racha de entrenamiento sigue creciendo",
        "/progress"
      )
      break // Only one milestone notification per update
    }
  }
}, "user_stats")
