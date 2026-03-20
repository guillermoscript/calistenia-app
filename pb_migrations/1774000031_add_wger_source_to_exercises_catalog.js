/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("exercises_catalog")
  collection.fields.add(new Field({
    name: "source",
    type: "text",
    required: false,
  }))
  collection.fields.add(new Field({
    name: "wger_id",
    type: "number",
    required: false,
  }))
  collection.fields.add(new Field({
    name: "wger_language",
    type: "text",
    required: false,
  }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("exercises_catalog")
  collection.fields.removeByName("source")
  collection.fields.removeByName("wger_id")
  collection.fields.removeByName("wger_language")
  app.save(collection)
})
