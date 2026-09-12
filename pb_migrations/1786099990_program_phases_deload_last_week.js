/// <reference path="../pb_data/types.d.ts" />
/**
 * #716 — `program_phases.deload_last_week`: la semana de descarga en el motor.
 *
 * Los 15 programas oficiales prometen en `instructions` una descarga («semana
 * 5 y 9, baja a 2-3 series») que el modelo de datos no podía expresar: las
 * fases son rangos de semanas idénticas. Este flag, POR FASE, dice «la última
 * semana del rango es de descarga»: el motor presenta la mitad de series
 * (`ceil(sets/2)`) en los ejercicios principales y las pantallas lo anuncian.
 * Es la opción A del issue: un bool, sin cambiar el modelo de días.
 *
 * Timestamp ANTERIOR a la siembra `1786100000_seed_official_programs.js` a
 * propósito. PocketBase aplica toda migración que no esté en `_migrations`,
 * en orden de nombre, así que en prod entra igual; y en una base fresca (CI,
 * local) tiene que existir ANTES de que la siembra y las resiembras
 * (`pnpm programs:reseed`, que insertan la columna por SQL) escriban en ella.
 *
 * Apagado por defecto: un `bool` ausente en PocketBase es `false`, así que no
 * hace falta backfill. Y va `required: false` porque un bool requerido rechaza
 * justo el `false` (mismo motivo que `auto_progress`, #617).
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1688347176") // program_phases

  // Idempotente: la colección puede venir ya migrada de otra rama.
  if (collection.fields.getByName("deload_last_week")) return

  collection.fields.add(new Field({
    "hidden": false,
    "id": "bool_ph_deload_last_week",
    "name": "deload_last_week",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1688347176")

  if (!collection.fields.getByName("deload_last_week")) return

  collection.fields.removeById("bool_ph_deload_last_week")

  return app.save(collection)
})
