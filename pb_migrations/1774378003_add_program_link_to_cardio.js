/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("cardio_sessions")

  collection.fields.add({
    "cascadeDelete": false,
    "collectionId": "pbc_2970041692",
    "hidden": false,
    "id": "relation_cardio_program",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "program",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  })

  collection.fields.add({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text_cardio_program_day_key",
    "max": 0,
    "min": 0,
    "name": "program_day_key",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  })

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("cardio_sessions")
  collection.fields.removeByName("program")
  collection.fields.removeByName("program_day_key")
  app.save(collection)
})
