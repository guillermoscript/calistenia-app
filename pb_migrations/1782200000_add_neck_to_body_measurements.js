/// <reference path="../pb_data/types.d.ts" />

/**
 * Add neck field to body_measurements (#227).
 *
 * - neck: circunferencia del cuello en cm, opcional. Junto con cintura (+cadera
 *   en mujeres) y la altura del usuario permite estimar % de grasa corporal por
 *   el método US Navy (estimateBodyFatNavy en packages/core/lib/body-composition.ts).
 *
 * Campo nuevo, sin tocar field.id existentes — sin riesgo de pérdida de datos.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_body_meas_001")

  if (!collection.fields.find(f => f.name === "neck")) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "number_bm_neck",
      "max": null,
      "min": 0,
      "name": "neck",
      "onlyInt": false,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }

  app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_body_meas_001")
    collection.fields = collection.fields.filter(f => f.id !== "number_bm_neck")
    app.save(collection)
  } catch (e) {}
})
