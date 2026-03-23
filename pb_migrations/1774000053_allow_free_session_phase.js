/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  // Update phase field: allow 0 for free sessions (was min: 1, max: 4)
  const phaseField = collection.fields.find(f => f.name === "phase")
  if (phaseField) {
    phaseField.min = 0
  }

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  // Revert: restore min: 1
  const phaseField = collection.fields.find(f => f.name === "phase")
  if (phaseField) {
    phaseField.min = 1
  }

  return app.save(collection)
})
