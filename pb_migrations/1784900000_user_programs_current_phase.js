/// <reference path="../pb_data/types.d.ts" />
/**
 * #616 — `user_programs.current_phase`: override manual de la fase.
 *
 * Hasta ahora la fase era `settings.phase`, un entero GLOBAL del usuario:
 * cambiar de programa no la reseteaba. La fase pasa a derivarse de
 * `started_at` + los rangos `weeks` de `program_phases` (ver
 * `packages/core/lib/programProgress.ts`), y este campo guarda la excepción:
 * la fase que el usuario fija a mano PARA ESE PROGRAMA.
 *
 * Vacío / 0 = automática. Se guarda aquí y no en `settings` justamente para
 * que apuntarse a otro programa empiece de cero.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4176526388") // user_programs

  // Idempotente: la colección puede venir ya migrada de otra rama.
  if (collection.fields.getByName("current_phase")) return

  collection.fields.add(new Field({
    "hidden": false,
    "id": "number_up_current_phase",
    "max": null,
    "min": 0,
    "name": "current_phase",
    "onlyInt": true,
    "presentable": false,
    // `required: false` a propósito: en PocketBase un number requerido rechaza
    // el 0 (#376), y 0 es justo el valor «sin override».
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4176526388")

  if (!collection.fields.getByName("current_phase")) return

  collection.fields.removeById("number_up_current_phase")

  return app.save(collection)
})
