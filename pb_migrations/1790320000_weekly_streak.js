/// <reference path="../pb_data/types.d.ts" />

/**
 * Racha SEMANAL (#801): esquema + recomputo de las rachas existentes.
 *
 * `workout_streak_current` / `workout_streak_best` dejan de contar dias
 * seguidos y pasan a contar semanas naturales (lunes a domingo) seguidas con al
 * menos 2 dias distintos de entreno. Mismo nombre de campo a proposito: la view
 * `public_user_stats`, el ranking y los perfiles lo leen tal cual.
 *
 * ESQUEMA. Dos campos nuevos en `user_stats` que el hook necesita para
 * decidir en un solo UPDATE atomico (ver `pb_hooks/utils/workout_stats.js`):
 *   - `streak_week_start`: lunes ("YYYY-MM-DD") de la ultima semana con entreno.
 *   - `streak_week_mask`:  dias de esa semana con entreno, como bits
 *                          (lunes = 1 ... domingo = 64).
 * `id` FIJOS e idempotente (feedback_migration_safety). Privados sin tocar
 * nada mas: `public_user_stats` enumera sus columnas, no hace `SELECT *`.
 *
 * DATOS. Cambia el SIGNIFICADO del campo, asi que no basta con el esquema: se
 * recomputa todo desde el historial (no se resetea a nadie). `best` se
 * SOBRESCRIBE, no se hace MAX con el anterior como en 1783600000: el anterior
 * esta en dias y siempre ganaria.
 *
 * Mismas fuentes y mismas fechas que 1783600000 (las tres colecciones de
 * sesion; `completed_at` es hora local del usuario, circuito/cardio son UTC).
 *
 * TODO EN SQL CRUDO, A PROPOSITO, por lo mismo que 1783600000: guardar con la
 * API de records dispararia el hook de hitos de racha y mandaria una tanda de
 * push "¡N semanas seguidas!" a todo el mundo a la vez.
 */

const WEEK_START_FIELD_ID = "text_user_stats_streak_week_start"
const WEEK_MASK_FIELD_ID = "number_user_stats_streak_week_mask"
const STREAK_WEEKLY_GOAL = 2
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function pad2(n) {
  return n < 10 ? "0" + n : "" + n
}

function toUtcDate(day) {
  const parts = day.split("-")
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
}

function fmt(d) {
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate())
}

/** Lunes = 0 ... domingo = 6. */
function weekdayIndex(day) {
  return (toUtcDate(day).getUTCDay() + 6) % 7
}

function weekStartOf(day) {
  const d = toUtcDate(day)
  d.setUTCDate(d.getUTCDate() - weekdayIndex(day))
  return fmt(d)
}

function shiftDay(day, delta) {
  const d = toUtcDate(day)
  d.setUTCDate(d.getUTCDate() + delta)
  return fmt(d)
}

function popcount(mask) {
  let n = 0
  for (let i = 0; i < 7; i++) n += (mask >> i) & 1
  return n
}

/**
 * De los dias con entreno de un usuario saca la racha semanal viva, la mejor y
 * el estado de la ultima semana (lo que el hook necesita para seguir).
 *
 * Viva = semanas cumplidas seguidas que terminan en esta semana o en la
 * anterior (igual que `computeCurrentWeeklyStreak` en el cliente). Si esta
 * semana tiene entrenos pero aun no llega a 2 dias, la racha que se guarda es
 * la que termina la semana anterior: en cuanto llegue al segundo dia el hook
 * sumara 1.
 */
function computeWeekly(days, today) {
  // { "YYYY-MM-DD" (lunes): mascara }
  const masks = {}
  for (let i = 0; i < days.length; i++) {
    const week = weekStartOf(days[i])
    masks[week] = (masks[week] || 0) | (1 << weekdayIndex(days[i]))
  }
  const weeks = Object.keys(masks).sort()
  if (weeks.length === 0) return { current: 0, best: 0, weekStart: "", mask: 0 }

  const achieved = (week) => popcount(masks[week] || 0) >= STREAK_WEEKLY_GOAL

  let best = 0
  let run = 0
  let prevAchieved = ""
  for (let i = 0; i < weeks.length; i++) {
    if (!achieved(weeks[i])) continue
    run = prevAchieved && shiftDay(prevAchieved, 7) === weeks[i] ? run + 1 : 1
    if (run > best) best = run
    prevAchieved = weeks[i]
  }

  const thisWeek = weekStartOf(today)
  let cursor = achieved(thisWeek) ? thisWeek : shiftDay(thisWeek, -7)
  let current = 0
  while (achieved(cursor)) {
    current++
    cursor = shiftDay(cursor, -7)
  }

  const lastWeek = weeks[weeks.length - 1]
  return { current: current, best: best, weekStart: lastWeek, mask: masks[lastWeek] }
}

migrate((app) => {
  const stats = app.findCollectionByNameOrId("user_stats")
  let changed = false
  if (!stats.fields.find(f => f.name === "streak_week_start")) {
    stats.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": WEEK_START_FIELD_ID,
      "max": 10,
      "min": 0,
      "name": "streak_week_start",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
    changed = true
  }
  if (!stats.fields.find(f => f.name === "streak_week_mask")) {
    stats.fields.add(new Field({
      "hidden": false,
      "id": WEEK_MASK_FIELD_ID,
      "max": 127,
      "min": 0,
      "name": "streak_week_mask",
      "onlyInt": true,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
    changed = true
  }
  if (changed) app.save(stats)

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
      const day = String(rows[i].day)
      if (!DAY_RE.test(day)) continue
      const userId = String(rows[i].user)
      if (!daysByUser[userId]) daysByUser[userId] = []
      daysByUser[userId].push(day)
    }

    const now = new Date()
    const today = now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate())
    const stamp = now.toISOString().replace("T", " ")

    // Todas las filas, tambien las que no tienen sesiones: su racha en dias
    // (si la habia) no significa nada en semanas.
    const statRows = arrayOf(new DynamicModel({ id: "", user: "" }))
    app.db().newQuery(`SELECT id, "user" AS user FROM user_stats`).all(statRows)

    let updated = 0
    for (let i = 0; i < statRows.length; i++) {
      const weekly = computeWeekly(daysByUser[String(statRows[i].user)] || [], today)
      app.db().newQuery(`
        UPDATE user_stats SET
          workout_streak_current = {:current},
          workout_streak_best = {:best},
          streak_week_start = {:weekStart},
          streak_week_mask = {:mask},
          updated_at = {:stamp}
        WHERE id = {:id}
      `).bind({
        id: String(statRows[i].id),
        current: weekly.current,
        best: weekly.best,
        weekStart: weekly.weekStart,
        mask: weekly.mask,
        stamp: stamp,
      }).execute()
      updated++
    }

    console.log("[weekly_streak] " + updated + " filas recomputadas a racha semanal")
  } catch (err) {
    // Una migracion que lanza deja a PocketBase sin arrancar. Si el recomputo
    // falla, las rachas se quedan en dias hasta el siguiente entreno de cada
    // usuario (el hook empieza la semana de cero), que es mejor que tirar
    // produccion. Se puede reintentar borrando la fila de `_migrations`.
    console.log("[weekly_streak] FALLO, rachas sin recomputar:", err)
  }
}, (app) => {
  // Sin vuelta atras de los datos: la racha en dias se puede recomputar con la
  // migracion 1783600000 si hiciera falta. Solo se quita el esquema.
  const stats = app.findCollectionByNameOrId("user_stats")
  stats.fields.removeById(WEEK_START_FIELD_ID)
  stats.fields.removeById(WEEK_MASK_FIELD_ID)
  app.save(stats)
})
