/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_3660498186")
  } catch (e) {
    return // Collection doesn't exist, skip
  }

  // add field
  collection.fields.addAt(6, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3485334036",
    "max": 0,
    "min": 0,
    "name": "note",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_3660498186")
    collection.fields.removeById("text3485334036")
    return app.save(collection)
  } catch (e) {
    // Collection doesn't exist, ignore
  }
})
