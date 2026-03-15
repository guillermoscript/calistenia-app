/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("_pb_users_auth_")
  } catch (e) {
    return // Collection doesn't exist, skip
  }

  // add field
  collection.fields.addAt(10, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3578368839",
    "max": 0,
    "min": 0,
    "name": "display_name",
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
    const collection = app.findCollectionByNameOrId("_pb_users_auth_")
    collection.fields.removeById("text3578368839")
    return app.save(collection)
  } catch (e) {
    // Collection doesn't exist, ignore
  }
})
