/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("race_participants")
  collection.fields.add(new Field({ name: "last_lat", type: "number" }))
  collection.fields.add(new Field({ name: "last_lng", type: "number" }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("race_participants")
  collection.fields.removeByName("last_lat")
  collection.fields.removeByName("last_lng")
  app.save(collection)
})
