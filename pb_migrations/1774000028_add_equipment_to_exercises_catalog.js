/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("exercises_catalog")
  collection.fields.add(new Field({
    name: "equipment",
    type: "json",
    required: false,
  }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("exercises_catalog")
  collection.fields.removeByName("equipment")
  app.save(collection)
})
