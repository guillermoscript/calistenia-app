/// <reference path="../pb_data/types.d.ts" />

/**
 * Racha SEMANAL (#801): historial de objetivos + recomputo de las rachas.
 *
 * `workout_streak_current` / `workout_streak_best` dejan de contar dias
 * seguidos y pasan a contar semanas de calendario (lunes a domingo) seguidas
 * cumpliendo el objetivo semanal. Mismo nombre de campo a proposito: la view
 * `public_user_stats`, el ranking, los perfiles y los widgets lo leen tal cual.
 *
 * ESQUEMA
 *   - `settings.weekly_goal_log` (json): `[{from: "YYYY-MM-DD", goal}]`, los
 *     cambios del objetivo efectivo. Lo escribe el cliente (`useWorkoutStreak`)
 *     y lo leen cliente y servidor (`pb_hooks/utils/weekly_streak.js`).
 *   - Fuera `user_stats.streak_week_start` / `streak_week_mask`, del primer
 *     borrador de #801 (PR #849, nunca en produccion). Solo existen en copias
 *     locales donde se probo ese borrador.
 *   `id` FIJO e idempotente (feedback_migration_safety).
 *
 * DATOS. Cambia el SIGNIFICADO del campo, asi que se recomputa todo desde el
 * historial (no se resetea a nadie). Nadie tiene historial de objetivos
 * todavia, asi que todas las semanas se miden contra el objetivo historico, 3,
 * que es lo que decide la issue cuando el programa de semanas pasadas no se
 * puede reconstruir. `best` se SOBRESCRIBE, no se hace MAX con el anterior: el
 * anterior esta en dias y siempre ganaria.
 *
 * Mismas fuentes y mismas fechas que el hook: las tres colecciones de sesion,
 * los 10 primeros caracteres de `completed_at` (hora local del usuario) o de
 * `finished_at`/`started_at` (UTC).
 *
 * TODO EN SQL CRUDO, A PROPOSITO, por lo mismo que 1783600000: guardar con la
 * API de records dispararia el hook de hitos y mandaria una tanda de push
 * "¡N semanas seguidas!" a todo el mundo a la vez.
 *
 * El algoritmo va COPIADO (no `require`): una migracion tiene que dar lo mismo
 * el dia que se escribe y dentro de un año, cambie lo que cambie el hook. Es
 * `computeWeeklyStreak` de `pb_hooks/utils/weekly_streak.js` con objetivo fijo.
 */

const GOAL_LOG_FIELD_ID = "json_settings_weekly_goal_log"
const OLD_WEEK_START_FIELD_ID = "text_user_stats_streak_week_start"
const OLD_WEEK_MASK_FIELD_ID = "number_user_stats_streak_week_mask"
const HISTORICAL_GOAL = 3

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86400000

function isDayStr(day) {
  if (typeof day !== "string" || !DAY_RE.test(day)) return false
  const p = day.split("-")
  const y = Number(p[0]), m = Number(p[1]), d = Number(p[2])
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function dayNumber(day) {
  const p = day.split("-")
  return Math.round(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / MS_PER_DAY)
}

function dayFromNumber(n) {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10)
}

function shiftDay(day, offset) {
  return dayFromNumber(dayNumber(day) + offset)
}

function mondayOf(day) {
  const n = dayNumber(day)
  return dayFromNumber(n - ((((n + 3) % 7) + 7) % 7))
}

/** `computeWeeklyStreak(days, HISTORICAL_GOAL, today)` → { current, best }. */
function weeklyStreak(days, today) {
  const goal = HISTORICAL_GOAL
  const currentWeek = mondayOf(today)
  const daysByWeek = {}
  let firstWeek = null
  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    if (!isDayStr(day) || day > today) continue
    const week = mondayOf(day)
    if (!daysByWeek[week]) daysByWeek[week] = {}
    daysByWeek[week][day] = true
    if (!firstWeek || week < firstWeek) firstWeek = week
  }
  const doneIn = (w) => (daysByWeek[w] ? Object.keys(daysByWeek[w]).length : 0)
  const metIn = (w) => doneIn(w) >= goal

  const thisMet = metIn(currentWeek)
  let current = thisMet ? 1 : 0
  if (firstWeek) {
    for (let w = shiftDay(currentWeek, -7); w >= firstWeek && metIn(w); w = shiftDay(w, -7)) current++
  }
  let best = current
  if (firstWeek) {
    let run = 0
    const weeks = (dayNumber(currentWeek) - dayNumber(firstWeek)) / 7
    for (let k = 0; k <= weeks; k++) {
      const wk = shiftDay(firstWeek, k * 7)
      if (wk === currentWeek && !thisMet) break
      run = metIn(wk) ? run + 1 : 0
      if (run > best) best = run
    }
  }
  return { current, best }
}

migrate((app) => {
  const settings = app.findCollectionByNameOrId("settings")
  if (!settings.fields.find(f => f.name === "weekly_goal_log")) {
    settings.fields.add(new Field({
      "hidden": false,
      "id": GOAL_LOG_FIELD_ID,
      "maxSize": 0,
      "name": "weekly_goal_log",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    }))
    app.save(settings)
  }

  const stats = app.findCollectionByNameOrId("user_stats")
  let dropped = false
  for (const id of [OLD_WEEK_START_FIELD_ID, OLD_WEEK_MASK_FIELD_ID]) {
    if (stats.fields.getById(id)) {
      stats.fields.removeById(id)
      dropped = true
    }
  }
  if (dropped) app.save(stats)

  try {
    // Una sola pasada por las tres colecciones, agrupada por (usuario, dia).
    const rows = arrayOf(new DynamicModel({ user: "", day: "" }))
    app.db().newQuery(`
      SELECT DISTINCT "user" AS user, day
      FROM (
        SELECT "user", substr(COALESCE(completed_at, ''), 1, 10) AS day
          FROM sessions
        UNION ALL
        SELECT "user", substr(COALESCE(NULLIF(finished_at, ''), started_at, ''), 1, 10) AS day
          FROM circuit_sessions
        UNION ALL
        SELECT "user", substr(COALESCE(NULLIF(finished_at, ''), started_at, ''), 1, 10) AS day
          FROM cardio_sessions
      )
      WHERE "user" <> '' AND "user" IN (SELECT "user" FROM user_stats)
    `).all(rows)

    const daysByUser = {}
    for (let i = 0; i < rows.length; i++) {
      const userId = String(rows[i].user)
      if (!daysByUser[userId]) daysByUser[userId] = []
      daysByUser[userId].push(String(rows[i].day))
    }

    // Mismo "hoy" que el hook (`serverToday`): el reloj del servidor, en UTC.
    const now = new Date()
    const pad2 = (n) => (n < 10 ? "0" + n : "" + n)
    const today = now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate())
    const stamp = now.toISOString().replace("T", " ")

    // Todas las filas, tambien las que no tienen sesiones: su racha en dias
    // (si la habia) no significa nada en semanas.
    const statRows = arrayOf(new DynamicModel({ id: "", user: "" }))
    app.db().newQuery(`SELECT id, "user" AS user FROM user_stats`).all(statRows)

    for (let i = 0; i < statRows.length; i++) {
      const streak = weeklyStreak(daysByUser[String(statRows[i].user)] || [], today)
      app.db().newQuery(`
        UPDATE user_stats SET
          workout_streak_current = {:current},
          workout_streak_best = {:best},
          updated_at = {:stamp}
        WHERE id = {:id}
      `).bind({ id: String(statRows[i].id), current: streak.current, best: streak.best, stamp: stamp }).execute()
    }

    console.log("[weekly_streak] " + statRows.length + " filas recomputadas a racha semanal")
  } catch (err) {
    // Una migracion que lanza deja a PocketBase sin arrancar. Si el recomputo
    // falla, cada racha se corrige sola en el siguiente entreno de su usuario
    // (el hook la recalcula entera) o en el rollover del lunes. Se puede
    // reintentar borrando la fila de `_migrations`.
    console.log("[weekly_streak] FALLO, rachas sin recomputar:", err)
  }
}, (app) => {
  // Sin vuelta atras de los datos: la racha en dias se puede recomputar con la
  // migracion 1783600000 si hiciera falta. Solo se quita el esquema.
  const settings = app.findCollectionByNameOrId("settings")
  settings.fields.removeById(GOAL_LOG_FIELD_ID)
  app.save(settings)
})
