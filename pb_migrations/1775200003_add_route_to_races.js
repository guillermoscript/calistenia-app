/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("races")
  collection.fields.add(new Field({ name: "route_points", type: "json" }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("races")
  collection.fields.removeByName("route_points")
  app.save(collection)
})
