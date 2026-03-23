/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_workout_rem")

  // Add reminder_type select field: 'workout' (default) or 'pause'
  collection.fields.add(new Field({
    "hidden": false,
    "id": "select_wr_reminder_type",
    "maxSelect": 1,
    "name": "reminder_type",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": ["workout", "pause"]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_workout_rem")
  collection.fields.removeById("select_wr_reminder_type")
  return app.save(collection)
})
