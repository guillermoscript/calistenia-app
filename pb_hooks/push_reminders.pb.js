/// <reference path="../pb_data/types.d.ts" />

/**
 * Crons de recordatorios push (comidas y entrenamientos).
 *
 * IMPORTANTE: los callbacks de cronAdd corren en un runtime JSVM AISLADO y no
 * ven funciones top-level de este archivo — los helpers viven en
 * ./utils/reminders.js y se requieren DENTRO de cada callback (mismo patrón y
 * mismo motivo que utils/notifications.js). Antes eran top-level y cada tick
 * moría con un ReferenceError silencioso: ningún reminder se envió nunca.
 */

// ── Meal reminders ─────────────────────────────────────────────────────────
cronAdd("push_meal_reminders", "* * * * *", () => {
  const helpers = require(`${__hooks}/utils/reminders.js`)
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentDay = now.getDay() // 0=Sunday

  let reminders
  try {
    reminders = $app.findRecordsByFilter(
      "meal_reminders",
      `enabled = true && hour = ${currentHour} && minute = ${currentMinute}`,
      "",
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
    const daysOfWeek = helpers.parseDaysOfWeek(reminder.getString("days_of_week"))

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

    helpers.sendPush(userId, `Hora de registrar tu ${label}`, body, "/nutrition")
  }
})

// ── Workout reminders ──────────────────────────────────────────────────────
cronAdd("push_workout_reminders", "* * * * *", () => {
  const helpers = require(`${__hooks}/utils/reminders.js`)
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentDay = now.getDay() // 0=Sunday

  let reminders
  try {
    reminders = $app.findRecordsByFilter(
      "workout_reminders",
      `enabled = true && hour = ${currentHour} && minute = ${currentMinute}`,
      "",
      100,
      0
    )
  } catch (e) {
    return
  }
  if (!reminders || reminders.length === 0) return

  for (const reminder of reminders) {
    const userId = reminder.getString("user")
    const daysOfWeek = helpers.parseDaysOfWeek(reminder.getString("days_of_week"))
    const reminderType = reminder.getString("reminder_type") || "workout"

    if (!daysOfWeek.includes(currentDay)) continue

    if (reminderType === "pause") {
      helpers.sendPush(
        userId,
        "Pausa Activa",
        "Levántate, estira y muévete — tu cuerpo lo agradece",
        "/workout"
      )
    } else {
      helpers.sendPush(
        userId,
        "Hora de entrenar!",
        "Tu entrenamiento te espera. No pierdas la racha!",
        "/workout"
      )
    }
  }
})
