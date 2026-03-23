/// <reference path="../pb_data/types.d.ts" />

/**
 * Helper: parse days_of_week from a record.
 * Handles both array and JSON-string formats.
 */
function parseDaysOfWeek(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    } catch (e) {}
  }
  return [1, 2, 3, 4, 5]
}

/**
 * Helper: send a push notification to a user via the API.
 */
function sendPush(userId, title, body, url) {
  const apiUrl = $os.getenv("AI_API_URL") || "http://localhost:3001"
  const internalKey = $os.getenv("INTERNAL_API_KEY") || ""
  const pushUrl = `${apiUrl}/api/send-push`

  console.log(`[push] → ${pushUrl} | user=${userId} | title="${title}" | key=${internalKey ? "set" : "MISSING"}`)

  try {
    const headers = { "Content-Type": "application/json" }
    if (internalKey) {
      headers["X-Internal-Key"] = internalKey
    }
    const res = $http.send({
      url: pushUrl,
      method: "POST",
      headers: headers,
      body: JSON.stringify({ user_id: userId, title, body, url }),
      timeout: 10,
    })
    console.log(`[push] ← status=${res.statusCode} body=${res.raw}`)
  } catch (e) {
    console.log("[push] ✗ error:", e)
  }
}

// ── Meal reminders ─────────────────────────────────────────────────────────
cronAdd("push_meal_reminders", "* * * * *", () => {
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentDay = now.getDay() // 0=Sunday

  let reminders
  try {
    reminders = $app.findRecordsByFilter(
      "meal_reminders",
      `enabled = true && hour = ${currentHour} && minute = ${currentMinute}`,
      "-created",
      100,
      0
    )
  } catch (e) {
    return
  }

  if (!reminders || reminders.length === 0) return

  const today = now.toISOString().split("T")[0]

  for (const reminder of reminders) {
    const userId = reminder.getString("user")
    const mealType = reminder.getString("meal_type")
    const daysOfWeek = parseDaysOfWeek(reminder.get("days_of_week"))

    if (!daysOfWeek.includes(currentDay)) continue

    // Skip if user already logged this meal type today
    try {
      const logged = $app.findRecordsByFilter(
        "nutrition_entries",
        `user = "${userId}" && meal_type = "${mealType}" && logged_at >= "${today} 00:00:00"`,
        "",
        1,
        0
      )
      if (logged && logged.length > 0) continue
    } catch (e) {
      // No entries found — proceed
    }

    // Get today's calorie progress for the notification body
    let todayCalories = 0
    let dailyGoal = 0
    try {
      const entries = $app.findRecordsByFilter(
        "nutrition_entries",
        `user = "${userId}" && logged_at >= "${today} 00:00:00"`,
        "",
        100,
        0
      )
      if (entries) {
        for (const entry of entries) {
          todayCalories += entry.getFloat("total_calories")
        }
      }
    } catch (e) {}

    try {
      const goals = $app.findRecordsByFilter(
        "nutrition_goals",
        `user = "${userId}"`,
        "",
        1,
        0
      )
      if (goals && goals.length > 0) {
        dailyGoal = goals[0].getFloat("daily_calories")
      }
    } catch (e) {}

    const mealLabels = {
      desayuno: "desayuno",
      almuerzo: "almuerzo",
      cena: "cena",
      snack: "snack",
    }
    const label = mealLabels[mealType] || mealType

    let body = `No olvides registrar tu ${label}`
    if (dailyGoal > 0) {
      body = `Llevas ${Math.round(todayCalories)}/${Math.round(dailyGoal)} kcal hoy`
    }

    sendPush(userId, `Hora de registrar tu ${label}`, body, "/nutrition")
  }
})

// ── Workout reminders ──────────────────────────────────────────────────────
cronAdd("push_workout_reminders", "* * * * *", () => {
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentDay = now.getDay() // 0=Sunday

  let reminders
  try {
    reminders = $app.findRecordsByFilter(
      "workout_reminders",
      `enabled = true && hour = ${currentHour} && minute = ${currentMinute}`,
      "-created",
      100,
      0
    )
  } catch (e) {
    console.log(`[workout-cron] query error at ${currentHour}:${currentMinute}:`, e)
    return
  }

  console.log(`[workout-cron] ${currentHour}:${String(currentMinute).padStart(2, "0")} day=${currentDay} | found=${reminders ? reminders.length : 0} reminders`)
  if (!reminders || reminders.length === 0) return

  for (const reminder of reminders) {
    const userId = reminder.getString("user")
    const daysOfWeek = parseDaysOfWeek(reminder.get("days_of_week"))
    const reminderType = reminder.getString("reminder_type") || "workout"

    if (!daysOfWeek.includes(currentDay)) continue

    if (reminderType === "pause") {
      sendPush(
        userId,
        "Pausa Activa",
        "Levántate, estira y muévete — tu cuerpo lo agradece",
        "/workout"
      )
    } else {
      sendPush(
        userId,
        "Hora de entrenar!",
        "Tu entrenamiento te espera. No pierdas la racha!",
        "/workout"
      )
    }
  }
})
