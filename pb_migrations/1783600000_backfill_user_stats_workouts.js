/// <reference path="../pb_data/types.d.ts" />

/**
 * Backfill de `user_stats` para las cuentas que ya existen (issue #412).
 *
 * Hasta ahora solo `circuit_sessions` escribia en `user_stats`, y ademas se
 * rendia si la fila no existia — y nadie la crea al registrarse. Resultado: la
 * mayoria de las cuentas no tienen fila, y las que la tienen solo cuentan
 * circuitos. Los hooks nuevos (`pb_hooks/workout_stats.pb.js`) arreglan el
 * futuro; esto arregla el pasado.
 *
 * Recomputa, uniendo las tres colecciones de sesion:
 *   - `total_sessions`         → numero total de sesiones completadas
 *   - `workout_streak_best`    → racha mas larga de dias consecutivos
 *   - `workout_streak_current` → racha viva (solo si el ultimo dia es hoy o ayer)
 *   - `last_workout_date`      → ultimo dia con entrenamiento
 *
 * NO toca `xp`, `level`, ni ninguno de los contadores de nutricion: se recomputa
 * lo de entrenamiento y punto.
 *
 * TODO EN SQL CRUDO, A PROPOSITO. Guardar con la API de records dispararia
 * `onRecordAfterUpdateSuccess` sobre `user_stats` — el hook de milestones de
 * racha de `notification_service.pb.js` — y el backfill mandaria una tanda de
 * notificaciones y push "¡7 dias seguidos!" a todo el mundo a la vez.
 *
 * Fechas: para `sessions` se usa `completed_at`, que el cliente escribe con hora
 * de pared local, asi que el dia es el del usuario. Para circuito y cardio se usa
 * `finished_at`/`started_at`, que son ISO UTC — igual que hacen el hook nuevo y
 * el calendario de la app. Ver la nota de `pb_hooks/utils/workout_stats.js`.
 */

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function pad2(n) {
  return n < 10 ? "0" + n : "" + n
}

/** Suma `delta` dias a "YYYY-MM-DD". En UTC: sin horas no hay saltos de DST. */
function shiftDay(day, delta) {
  const parts = day.split("-")
  const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
  d.setUTCDate(d.getUTCDate() + delta)
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate())
}

/**
 * De una lista de dias con entrenamiento saca la racha mas larga, la viva y el
 * ultimo dia. La racha solo esta "viva" si el ultimo dia es hoy o ayer; si no,
 * ya se rompio y vale 0 aunque el historico sea largo.
 */
function computeStreaks(days, today) {
  days.sort()
  const yesterday = shiftDay(today, -1)

  let best = 0
  let run = 0
  let prev = ""
  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    run = prev && shiftDay(day, -1) === prev ? run + 1 : 1
    if (run > best) best = run
    prev = day
  }

  const last = prev
  // `run` acaba valiendo la racha que termina en el ultimo dia.
  const current = last === today || last === yesterday ? run : 0
  return { best: best, current: current, last: last }
}

migrate((app) => {
  try {
    // Una sola pasada por las tres colecciones, agrupada por (usuario, dia).
    // El `IN (SELECT id FROM users)` evita insertar filas con una relacion rota
    // si quedo alguna sesion huerfana de una cuenta borrada.
    const rows = arrayOf(new DynamicModel({ user: "", day: "", n: 0 }))
    app.db().newQuery(`
      SELECT "user" AS user, day, COUNT(*) AS n
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
      WHERE "user" <> '' AND "user" IN (SELECT id FROM users)
      GROUP BY "user", day
    `).all(rows)

    // { userId: { total: n, days: ["YYYY-MM-DD", ...] } }
    const byUser = {}
    for (let i = 0; i < rows.length; i++) {
      const userId = String(rows[i].user)
      const day = String(rows[i].day)
      const n = Number(rows[i].n) || 0

      if (!byUser[userId]) byUser[userId] = { total: 0, days: [] }
      // Las sesiones sin fecha parseable cuentan para el total pero no pueden
      // aportar a la racha: no sabemos que dia fueron.
      byUser[userId].total += n
      if (DAY_RE.test(day)) byUser[userId].days.push(day)
    }

    const now = new Date()
    const today = now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate())
    const stamp = now.toISOString().replace("T", " ")

    let updated = 0
    let created = 0

    for (const userId in byUser) {
      const agg = byUser[userId]
      const streaks = computeStreaks(agg.days, today)

      const existing = arrayOf(new DynamicModel({ id: "" }))
      app.db()
        .newQuery(`SELECT id FROM user_stats WHERE "user" = {:user}`)
        .bind({ user: userId })
        .all(existing)

      const values = {
        total: agg.total,
        current: streaks.current,
        best: streaks.best,
        last: streaks.last,
        stamp: stamp,
      }

      if (existing.length > 0) {
        // `MAX(...)` de dos argumentos es el escalar de SQLite: si una fila ya
        // tenia un best mayor (p.ej. de un historico que ya no esta en la BD),
        // no lo hacemos retroceder.
        app.db().newQuery(`
          UPDATE user_stats SET
            total_sessions = {:total},
            workout_streak_current = {:current},
            workout_streak_best = MAX(COALESCE(workout_streak_best, 0), {:best}),
            last_workout_date = {:last},
            updated_at = {:stamp}
          WHERE id = {:id}
        `).bind(Object.assign({ id: String(existing[0].id) }, values)).execute()
        updated++
      } else {
        app.db().newQuery(`
          INSERT INTO user_stats (
            id, "user", xp, level, total_sessions, total_sets,
            total_nutrition_logs, total_lumbar_checks, total_weight_logs,
            workout_streak_current, workout_streak_best, weekly_goals_hit,
            nutrition_streak_current, nutrition_streak_best,
            last_workout_date, last_nutrition_date, achievements_unlocked, updated_at
          ) VALUES (
            {:id}, {:user}, 0, 1, {:total}, 0,
            0, 0, 0,
            {:current}, {:best}, 0,
            0, 0,
            {:last}, '', 0, {:stamp}
          )
        `).bind(Object.assign({
          id: $security.randomStringWithAlphabet(15, ID_ALPHABET),
          user: userId,
        }, values)).execute()
        created++
      }
    }

    console.log(
      "[backfill_user_stats] " + created + " filas creadas, " + updated + " actualizadas"
    )
  } catch (err) {
    // Una migracion que lanza deja a PocketBase sin arrancar. Un backfill que no
    // corre solo deja las stats como estaban (mal, pero como hoy), asi que aqui
    // preferimos ruido en el log a tirar produccion. Se puede reintentar
    // borrando la fila de `_migrations` y reiniciando.
    console.log("[backfill_user_stats] FALLO, stats sin recomputar:", err)
  }
}, (app) => {
  // Sin vuelta atras: los valores previos eran ceros o inexistentes y no hay
  // snapshot que restaurar. Volver a ejecutar la migracion recomputa desde cero,
  // que es mas barato que guardar el estado anterior de cada fila.
})
