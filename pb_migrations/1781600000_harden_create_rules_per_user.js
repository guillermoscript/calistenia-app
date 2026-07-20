/// <reference path="../pb_data/types.d.ts" />
/**
 * Cierra una inyección cross-user en 10 colecciones per-user (auditoría de
 * reglas 2026-07-20).
 *
 * Todas guardan datos privados por usuario y tienen list/view/update/delete
 * correctamente acotados a `user = @request.auth.id`, PERO su `createRule` era
 * solo `@request.auth.id != ""`: cualquier usuario autenticado podía crear
 * filas con el campo `user` apuntando a OTRA persona, contaminando sus datos
 * privados (p.ej. pantry/listas de compra ajenas) e incluso envenenando la IA
 * en las que la alimentan (health_samples, user_insights,
 * nutrition_coach_insights, daily_health_cache).
 *
 * Fix: exigir que el `user` del body sea el propio, exactamente el mismo patrón
 * que ya usan sets_log/settings/user_programs/programs/nutrition_goals (estas
 * 10 simplemente se omitieron). Se añade además la guardia anti-reasignación en
 * updateRule para que la fila no se pueda mover a otro usuario.
 *
 * Solo reglas; no se tocan campos (se preservan sus ids).
 */
const COLLECTIONS = [
  "weekly_meal_plans",
  "weekly_plan_days",
  "nutrition_coach_insights",
  "nutrition_badges",
  "health_samples",
  "daily_health_cache",
  "user_insights",
  "pantry_items",
  "pantry_events",
  "shopping_lists",
]

migrate((app) => {
  for (const name of COLLECTIONS) {
    const c = app.findCollectionByNameOrId(name)
    c.createRule = '@request.auth.id != "" && @request.body.user = @request.auth.id'
    c.updateRule = 'user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)'
    app.save(c)
  }
}, (app) => {
  // Restaura las reglas previas (más débiles) solo por simetría de rollback.
  for (const name of COLLECTIONS) {
    const c = app.findCollectionByNameOrId(name)
    c.createRule = '@request.auth.id != ""'
    c.updateRule = 'user = @request.auth.id'
    app.save(c)
  }
})
