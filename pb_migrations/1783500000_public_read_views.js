/// <reference path="../pb_data/types.d.ts" />

/**
 * #386 — cerrar la lectura cruzada de las colecciones de entrenamiento.
 *
 * PROBLEMA
 * `sessions`, `cardio_sessions`, `circuit_sessions`, `sets_log`, `settings` y
 * `user_stats` eran legibles FILA ENTERA por cualquier usuario autenticado. Como
 * PocketBase no tiene reglas de lectura por campo, abrir una colección para que
 * el muro pueda pintar "Fulano entrenó hoy" abría también todo lo demás que
 * viviera en esa fila. Así es como acabaron siendo públicos:
 *
 *   - `hr_avg` / `hr_max` / `calories_actual` (frecuencia cardiaca y calorías
 *     medidas por el reloj, migración 1777000003) en las TRES colecciones de
 *     sesión — datos de salud;
 *   - `calories_burned`, `splits`, velocidades y desnivel en cardio;
 *   - `weekly_goal`, `water_goal`, `start_date` en settings;
 *   - los contadores de nutrición, peso y lumbares de `user_stats`.
 *
 * Ninguno de ellos lo pide ninguna pantalla ajena; se filtraron por acompañar en
 * la fila a un campo que sí era necesario.
 *
 * SOLUCIÓN
 * Invertir el reparto: la lectura cruzada se sirve desde `view` collections que
 * exponen EXACTAMENTE las columnas que consumen las pantallas sociales, y las
 * tablas base pasan a owner-only. Una view de PocketBase tipa la columna `user`
 * como relación, así que admite la misma cláusula de bloqueo (#386) que las
 * tablas base — verificado en tests/pb_hooks/public_views.test.mjs.
 *
 * ESTA MIGRACIÓN SOLO CREA LAS VIEWS. Es aditiva: no cambia ninguna regla
 * existente, así que se puede desplegar sin coordinar nada. El cierre de las
 * tablas base va aparte, en 1783500001_lock_base_collections.js, porque ESE sí
 * deja ciega a la app móvil ya instalada. Ver la cabecera de aquel fichero.
 *
 * La propiedad importante no es la lista de campos de hoy, es la de mañana: un
 * campo nuevo en `sessions` ya no se publica solo. Hay que añadirlo a la view a
 * propósito. Es justo el fallo que dejó escapar la frecuencia cardiaca.
 *
 * Lo que NO cambia:
 *   - escrituras (createRule/updateRule/deleteRule intactas: las views son de
 *     solo lectura y toda escritura sigue yendo a la tabla base);
 *   - qué FILAS ve cada uno — el alcance sigue siendo "cualquier autenticado no
 *     bloqueado", igual que antes. Estrechar eso a seguidores es otra decisión,
 *     documentada en el issue;
 *   - `sessions.note` y `sets_log.*`, que el detalle público de sesión enseña
 *     por diseño desde que existe el muro.
 */

/** Cláusula de bloqueo estándar del repo (ver 1778000002). `owner` = campo dueño. */
function blockRule(owner) {
  return '@request.auth.id != "" && ' +
    owner + '.blocked_users.id != @request.auth.id && ' +
    '@request.auth.blocked_users.id != ' + owner + '.id'
}

/**
 * Cada view lista SOLO las columnas que alguna pantalla ajena necesita hoy.
 * Los comentarios dicen qué se deja fuera y por qué, para que la próxima
 * persona sepa si su campo nuevo debe entrar aquí.
 */
const VIEWS = [
  {
    name: "public_sessions",
    // Fuera: hr_avg, hr_max, calories_actual (datos de salud del reloj).
    // Dentro: todo lo que reconstruye el detalle público de sesión
    // (usePublicSessionDetail) + muro + calendario de perfil.
    query:
      "SELECT id, user, workout_key, phase, day, note, completed_at, program, " +
      "warmup_completed, warmup_skipped, warmup_duration_seconds, " +
      "cooldown_completed, cooldown_skipped, cooldown_duration_seconds, " +
      "duration_seconds, poses_completed, total_poses, exercise_timings " +
      "FROM sessions",
  },
  {
    name: "public_cardio_sessions",
    // Fuera: hr_avg, hr_max, calories_actual. La ruta GPS ya no vive aquí (#299).
    // Dentro: lo que pintan el muro y el detalle/tarjeta de cardio compartible.
    query:
      "SELECT id, user, activity_type, distance_km, duration_seconds, avg_pace, " +
      "elevation_gain, started_at, finished_at, note, calories_burned, " +
      "max_pace, avg_speed_kmh, max_speed_kmh, splits, program, program_day_key " +
      "FROM cardio_sessions",
  },
  {
    name: "public_circuit_sessions",
    // El único consumo ajeno es un CONTEO por ventana temporal (leaderboard).
    // El detalle de circuito solo se abre desde el calendario propio, así que
    // nombre, ejercicios, config, notas y FC se quedan en la tabla base.
    query: "SELECT id, user, started_at, finished_at FROM circuit_sessions",
  },
  {
    name: "public_sets_log",
    // Sin recorte de campos: el detalle público de sesión enseña reps, peso, RPE
    // y nota de cada serie desde que existe. Se crea igualmente para que la
    // tabla base quede owner-only y los campos futuros no salgan solos.
    query:
      "SELECT id, user, exercise_id, workout_key, reps, note, logged_at, weight_kg, rpe " +
      "FROM sets_log",
  },
  {
    name: "public_prs",
    // Fuera: start_date, weekly_goal, water_goal (objetivos personales).
    // `phase` sí: el perfil ajeno enseña la fase del programa.
    query:
      "SELECT id, user, phase, pr_pullups, pr_pushups, pr_lsit, pr_pistol, pr_handstand " +
      "FROM settings",
  },
  {
    name: "public_user_stats",
    // Fuera: total_nutrition_logs, total_lumbar_checks, total_weight_logs,
    // nutrition_streak_current/best, last_nutrition_date — hábitos de comida y
    // registros corporales, que no pinta ninguna pantalla ajena.
    query:
      "SELECT id, user, xp, level, total_sessions, total_sets, " +
      "workout_streak_current, workout_streak_best, weekly_goals_hit, " +
      "achievements_unlocked, last_workout_date FROM user_stats",
  },
]

migrate((app) => {
  for (const view of VIEWS) {
    let collection
    try {
      collection = app.findCollectionByNameOrId(view.name)
    } catch (e) {
      collection = null
    }
    if (collection) {
      collection.viewQuery = view.query
      collection.listRule = blockRule("user")
      collection.viewRule = blockRule("user")
      app.save(collection)
      continue
    }
    app.save(new Collection({
      type: "view",
      name: view.name,
      viewQuery: view.query,
      listRule: blockRule("user"),
      viewRule: blockRule("user"),
    }))
  }
}, (app) => {
  for (const view of VIEWS) {
    try {
      app.delete(app.findCollectionByNameOrId(view.name))
    } catch (e) { /* no llegó a crearse */ }
  }
})
