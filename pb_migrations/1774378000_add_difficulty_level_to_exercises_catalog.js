/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("exercises_catalog")
  collection.fields.add(new Field({
    name: "difficulty_level",
    type: "select",
    required: false,
    values: ["beginner", "intermediate", "advanced"],
  }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("exercises_catalog")
  collection.fields.removeByName("difficulty_level")
  app.save(collection)
})
