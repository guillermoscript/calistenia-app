/// <reference path="../pb_data/types.d.ts" />

// Cron job: check meal reminders every minute and send push notifications
cronAdd("push_meal_reminders", "* * * * *", () => {
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentDay = now.getDay() // 0=Sunday

  // Find active reminders matching current time
  let reminders
  try {
    reminders = $app
      .findRecordsByFilter(
        "meal_reminders",
        `enabled = true && hour = ${currentHour} && minute = ${currentMinute}`,
        "-created",
        100,
        0
      )
  } catch (e) {
    return // no reminders found
  }

  if (!reminders || reminders.length === 0) return

  const today = now.toISOString().split("T")[0]

  for (const reminder of reminders) {
    const userId = reminder.getString("user")
    const mealType = reminder.getString("meal_type")
    const daysOfWeek = reminder.get("days_of_week") || [1, 2, 3, 4, 5]

    // Check if today is in allowed days
    if (!daysOfWeek.includes(currentDay)) continue

    // Check if user already logged this meal type today
    try {
      const logged = $app.findRecordsByFilter(
        "nutrition_entries",
        `user = "${userId}" && meal_type = "${mealType}" && logged_at >= "${today} 00:00:00"`,
        "",
        1,
        0
      )
      if (logged && logged.length > 0) continue // already logged
    } catch (e) {
      // No entries found — proceed with notification
    }

    // Get today's calorie total for the notification body
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
    } catch (e) {
      // ignore
    }

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
    } catch (e) {
      // ignore
    }

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

    // Send push via the API
    try {
      const apiUrl =
        $os.getenv("AI_API_URL") || "http://localhost:3001"
      $http.send({
        url: `${apiUrl}/api/send-push`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          title: `Hora de registrar tu ${label}`,
          body: body,
          url: "/nutrition",
        }),
        timeout: 10,
      })
    } catch (e) {
      console.log("Push send error:", e)
    }
  }
})
