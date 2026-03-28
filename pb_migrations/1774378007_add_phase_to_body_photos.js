/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("body_photos")
  collection.fields.add(new Field({
    name: "phase",
    type: "number",
    min: 1,
    max: 4,
    onlyInt: true,
  }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("body_photos")
  collection.fields.removeByName("phase")
  app.save(collection)
})
