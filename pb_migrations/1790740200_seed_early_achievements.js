/// <reference path="../pb_data/types.d.ts" />

/**
 * Siembra los tres logros tempranos (#802): `first_workout`, `three_workouts`
 * y `first_week_complete`. Los dispara `pb_hooks/utils/achievements.js` desde
 * `recordWorkout`.
 *
 * `key` es estable e inglés. `name`/`description` van en inglés solo como
 * respaldo: las apps resuelven el texto visible por `key` desde
 * `packages/core/locales` (`achievements.<key>.name`), así que no hay español
 * fijo en la base de datos.
 *
 * IDEMPOTENTE: si la `key` ya existe no se toca (ni se pisa un ajuste hecho a
 * mano). Sin backfill de `user_achievements` a propósito: las apps muestran
 * como conseguido todo lo que sus stats ya cumplen y la fila se crea en el
 * siguiente entreno, sin avisar a quien ya llevaba tiempo.
 */

const SEEDS = [
  { key: "first_workout", name: "First workout", description: "Complete your first workout", icon: "🏁", tier: "bronze", requirement_type: "total_sessions", requirement_value: 1, xp_reward: 50, sort_order: 101 },
  { key: "three_workouts", name: "Three workouts", description: "Complete 3 workouts", icon: "💪", tier: "bronze", requirement_type: "total_sessions", requirement_value: 3, xp_reward: 100, sort_order: 102 },
  { key: "first_week_complete", name: "First full week", description: "Hit your weekly goal for the first time", icon: "📅", tier: "silver", requirement_type: "weeks_completed", requirement_value: 1, xp_reward: 150, sort_order: 103 },
]

migrate((app) => {
  const collection = app.findCollectionByNameOrId("achievements")
  for (const seed of SEEDS) {
    let exists = true
    try {
      app.findFirstRecordByFilter("achievements", "key = {:k}", { k: seed.key })
    } catch (e) {
      exists = false
    }
    if (exists) continue
    const record = new Record(collection)
    record.set("key", seed.key)
    record.set("name", seed.name)
    record.set("description", seed.description)
    record.set("category", "milestone")
    record.set("icon", seed.icon)
    record.set("tier", seed.tier)
    record.set("requirement_type", seed.requirement_type)
    record.set("requirement_value", seed.requirement_value)
    record.set("xp_reward", seed.xp_reward)
    record.set("sort_order", seed.sort_order)
    app.save(record)
    console.log("[seed_early_achievements] sembrado " + seed.key)
  }
}, (app) => {
  for (const seed of SEEDS) {
    try {
      const record = app.findFirstRecordByFilter("achievements", "key = {:k}", { k: seed.key })
      app.delete(record)
    } catch (e) { /* ya no estaba */ }
  }
})
