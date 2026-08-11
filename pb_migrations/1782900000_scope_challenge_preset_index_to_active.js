/// <reference path="../pb_data/types.d.ts" />

const OLD_INDEX = "CREATE UNIQUE INDEX idx_challenges_creator_preset ON challenges (creator, preset_key) WHERE preset_key != ''"
const NEW_INDEX = "CREATE UNIQUE INDEX idx_challenges_creator_preset ON challenges (creator, preset_key) WHERE preset_key != '' AND status = 'active'"

/**
 * Limita el índice único de presets a los retos ACTIVOS.
 *
 * Sin el `status = 'active'`, un preset terminado bloqueaba para siempre volver
 * a empezarlo: el índice rechazaba la segunda ronda con UNIQUE constraint. Los
 * presets son retos de 7/30 días pensados para repetirse, así que la unicidad
 * solo debe aplicar a la ronda en curso.
 *
 * Va en una migración aparte (y no editando la que creó el índice) para que las
 * instalaciones que ya aplicaron la anterior converjan igual: PocketBase no
 * re-ejecuta un fichero ya aplicado.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("challenges")

  collection.indexes = (collection.indexes || []).filter(i => !i.includes("idx_challenges_creator_preset"))
  collection.indexes.push(NEW_INDEX)

  app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("challenges")
    collection.indexes = (collection.indexes || []).filter(i => !i.includes("idx_challenges_creator_preset"))
    collection.indexes.push(OLD_INDEX)
    app.save(collection)
  } catch (e) {}
})
