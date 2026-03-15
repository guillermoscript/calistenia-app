/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_3660498186")
  } catch (e) {
    return // Collection doesn't exist, skip
  }

  // add field
  collection.fields.addAt(7, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_2970041692",
    "hidden": false,
    "id": "relation2465036164",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "program",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_3660498186")
    collection.fields.removeById("relation2465036164")
    return app.save(collection)
  } catch (e) {
    // Collection doesn't exist, ignore
  }
})
