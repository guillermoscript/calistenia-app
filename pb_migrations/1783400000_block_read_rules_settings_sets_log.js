/// <reference path="../pb_data/types.d.ts" />

/**
 * Completa el enforcement de lectura del bloqueo en `settings` y `sets_log` (#386).
 *
 * `1778000002_block_read_rules.js` aplicó la cláusula doble de bloqueo a las
 * nueve colecciones sociales de la spec 2026-07-14, pero dejó fuera dos que
 * también son legibles por cualquier usuario autenticado:
 *
 *  - `settings`: abierta en `1775100007_open_leaderboard_read_rules.js` para que
 *    el leaderboard leyera los PRs (`pr_pullups`, `pr_pushups`, `pr_lsit`,
 *    `pr_handstand`). Se quedó en `@request.auth.id != ""` a secas, así que un
 *    usuario al que has bloqueado sigue pudiendo leer tus PRs, tu fase, tu
 *    `weekly_goal`, tu `start_date` y tu `water_goal`.
 *  - `sets_log`: abierta en `1777000005_relax_sets_log_read_rules.js` para las
 *    métricas por ejercicio de los retos. Guarda el detalle serie a serie
 *    (reps, peso, RPE y notas), y tampoco filtra bloqueos.
 *
 * Esto NO cambia el alcance de lectura (siguen siendo legibles por cualquier
 * autenticado); solo cierra la incoherencia de que el bloqueo se respete en
 * `sessions`/`cardio_sessions`/`user_stats` pero no en estas dos. El alcance en
 * sí se decide aparte en #386.
 *
 * Multi-relación con != = all-match ("no contiene"); lista vacía pasa, así que
 * los usuarios sin bloqueos no se ven afectados.
 *
 * Solo se tocan reglas: no se modifica ningún campo, por lo que se preservan
 * todos los `field.id`.
 */
const TARGETS = [
  // [colección, campo dueño, regla previa para el down]
  ["settings", "user", '@request.auth.id != ""'],
  ["sets_log", "user", '@request.auth.id != ""'],
]

migrate((app) => {
  for (const [name, owner] of TARGETS) {
    const collection = app.findCollectionByNameOrId(name)
    const rule = '@request.auth.id != "" && ' +
      owner + '.blocked_users.id != @request.auth.id && ' +
      '@request.auth.blocked_users.id != ' + owner + '.id'
    collection.listRule = rule
    collection.viewRule = rule
    app.save(collection)
  }
}, (app) => {
  for (const [name, , prevRule] of TARGETS) {
    try {
      const collection = app.findCollectionByNameOrId(name)
      collection.listRule = prevRule
      collection.viewRule = prevRule
      app.save(collection)
    } catch (e) {}
  }
})
