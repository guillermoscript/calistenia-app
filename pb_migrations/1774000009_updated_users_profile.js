/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("_pb_users_auth_")
  } catch (e) {
    return // Collection doesn't exist, skip
  }

  // add weight field
  collection.fields.addAt(11, new Field({
    "hidden": false,
    "id": "number_user_weight",
    "max": null,
    "min": 0,
    "name": "weight",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add height field
  collection.fields.addAt(12, new Field({
    "hidden": false,
    "id": "number_user_height",
    "max": null,
    "min": 0,
    "name": "height",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add level field
  collection.fields.addAt(13, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text_user_level",
    "max": 0,
    "min": 0,
    "name": "level",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add goal field
  collection.fields.addAt(14, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text_user_goal",
    "max": 0,
    "min": 0,
    "name": "goal",
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
    collection.fields.removeById("number_user_weight")
    collection.fields.removeById("number_user_height")
    collection.fields.removeById("text_user_level")
    collection.fields.removeById("text_user_goal")
    return app.save(collection)
  } catch (e) {
    // Collection doesn't exist, ignore
  }
})
