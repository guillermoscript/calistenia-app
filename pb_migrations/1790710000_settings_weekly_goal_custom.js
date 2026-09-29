/// <reference path="../pb_data/types.d.ts" />

/**
 * Objetivo semanal elegido a mano: `settings.weekly_goal_custom` (#853).
 *
 * `settings.weekly_goal` vale 5 para casi todas las cuentas: es el valor con
 * el que el cliente creaba la fila y ninguna pantalla dejaba cambiarlo. El
 * inicio nuevo (épica #852) usa como objetivo los días del programa y solo
 * respeta `weekly_goal` cuando este campo es `true`, que lo pone la UI de
 * Perfil (#856 web, #859 móvil) al guardar. Lo resuelve
 * `packages/core/lib/weeklyGoal.ts`.
 *
 * Sin backfill a propósito: vacío/`false` = «usa los días del programa», que es
 * justo lo que se quiere para el 5 que nadie eligió.
 *
 * IDEMPOTENTE: si el campo ya existe no se guarda nada. El `id` es FIJO
 * (feedback_migration_safety) para que el `down` lo encuentre y para que PB no
 * lo trate como columna nueva si la migración se repite.
 */

const FIELD_ID = "bool_settings_weekly_goal_custom"

migrate((app) => {
  const settings = app.findCollectionByNameOrId("settings")
  if (settings.fields.find(f => f.name === "weekly_goal_custom")) return
  settings.fields.add(new Field({
    "hidden": false,
    "id": FIELD_ID,
    "name": "weekly_goal_custom",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))
  app.save(settings)
  console.log("[settings_weekly_goal_custom] campo weekly_goal_custom añadido")
}, (app) => {
  const settings = app.findCollectionByNameOrId("settings")
  settings.fields.removeById(FIELD_ID)
  app.save(settings)
})
