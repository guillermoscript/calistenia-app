/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("cardio_sessions")

  collection.fields.add(new Field({ name: "calories_burned", type: "number" }))
  collection.fields.add(new Field({ name: "max_pace", type: "number" }))
  collection.fields.add(new Field({ name: "avg_speed_kmh", type: "number" }))
  collection.fields.add(new Field({ name: "max_speed_kmh", type: "number" }))
  collection.fields.add(new Field({ name: "splits", type: "json" }))

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("cardio_sessions")

  collection.fields.removeByName("calories_burned")
  collection.fields.removeByName("max_pace")
  collection.fields.removeByName("avg_speed_kmh")
  collection.fields.removeByName("max_speed_kmh")
  collection.fields.removeByName("splits")

  app.save(collection)
})
