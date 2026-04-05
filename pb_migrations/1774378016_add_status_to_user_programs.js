/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4176526388")

  // Idempotent: skip if field already exists
  if (collection.fields.getByName("status")) return

  // status: active | completed | abandoned
  collection.fields.add(new Field({
    "hidden": false,
    "id": "select_up_status",
    "maxSelect": 1,
    "name": "status",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": ["active", "completed", "abandoned"]
  }))

  // ended_at: when the user completed or abandoned the program
  collection.fields.add(new Field({
    "hidden": false,
    "id": "date_up_ended_at",
    "max": "",
    "min": "",
    "name": "ended_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4176526388")

  collection.fields.removeById("select_up_status")
  collection.fields.removeById("date_up_ended_at")

  return app.save(collection)
})
