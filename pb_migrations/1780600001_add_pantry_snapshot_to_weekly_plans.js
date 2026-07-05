/// <reference path="../pb_data/types.d.ts" />
// #171 F2: foto del inventario usado al generar un plan pantry-aware (auditabilidad)
migrate((app) => {
  const collection = app.findCollectionByNameOrId("weekly_meal_plans")
  if (!collection.fields.getByName("pantry_snapshot")) {
    collection.fields.add(new Field({
      name: "pantry_snapshot",
      type: "json",
      required: false,
      maxSize: 0,
    }))
  }
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("weekly_meal_plans")
  const f = collection.fields.getByName("pantry_snapshot")
  if (f) {
    collection.fields.removeById(f.id)
  }
  app.save(collection)
})
