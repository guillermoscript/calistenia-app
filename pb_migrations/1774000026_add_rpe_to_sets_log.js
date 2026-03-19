/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("sets_log")

  collection.fields.add(new Field({
    "hidden": false,
    "id": "number_rpe",
    "max": 10,
    "min": 1,
    "name": "rpe",
    "onlyInt": true,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("sets_log")
  collection.fields.removeByName("rpe")
  return app.save(collection)
})
