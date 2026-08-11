/// <reference path="../pb_data/types.d.ts" />

// Sesiones libres/manuales (#376): `phase` pasa a opcional.
//
// La migración 1774000053 bajó `min` de 1 a 0 con la intención de permitir
// `phase: 0` en las sesiones libres, pero dejó el campo como `required: true`.
// PocketBase trata el 0 de un campo numérico *required* como vacío, así que ese
// 0 seguía rechazándose con `validation_required` — y el código, mientras tanto,
// mandaba -1, que choca con `min: 0`. Ningún valor era aceptable y toda sesión
// libre fallaba con un 400 silencioso.
//
// Se muta el campo existente localizado por nombre (mismo patrón que
// 1774000053) para preservar su `id` y no perder los datos ya escritos.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  const phaseField = collection.fields.find(f => f.name === "phase")
  if (phaseField) {
    phaseField.required = false
  }

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  const phaseField = collection.fields.find(f => f.name === "phase")
  if (phaseField) {
    phaseField.required = true
  }

  return app.save(collection)
})
