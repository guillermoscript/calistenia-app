/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("lumbar_checks")

  collection.fields.add(new Field({
    "hidden": false,
    "id": "bool797496658",
    "name": "slept_well",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  // No-op: slept_well was already optional in practice,
  // and we don't want to make it required again.
})
