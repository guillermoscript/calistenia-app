/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("settings")

  collection.fields.add(new Field({
    "hidden": false,
    "id": "number_water_goal",
    "max": null,
    "min": 0,
    "name": "water_goal",
    "onlyInt": true,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("settings")
  collection.fields.removeByName("water_goal")
  return app.save(collection)
})
