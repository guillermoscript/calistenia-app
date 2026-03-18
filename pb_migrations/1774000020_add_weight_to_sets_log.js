/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("sets_log")

  collection.fields.add(new Field({
    "hidden": false,
    "id": "number_weight_kg",
    "max": null,
    "min": 0,
    "name": "weight_kg",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("sets_log")
  collection.fields.removeByName("weight_kg")
  return app.save(collection)
})
