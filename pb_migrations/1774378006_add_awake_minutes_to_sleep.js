/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("sleep_entries")
  collection.fields.add(new Field({
    name: "awake_minutes",
    type: "number",
    min: 0,
    onlyInt: true,
  }))
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("sleep_entries")
  collection.fields.removeByName("awake_minutes")
  app.save(collection)
})
