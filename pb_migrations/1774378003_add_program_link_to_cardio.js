/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("cardio_sessions")

  collection.fields.add(new Field({
    name: "program",
    type: "relation",
    required: false,
    collectionId: "pbc_2970041692",
    cascadeDelete: false,
    maxSelect: 1,
  }))

  collection.fields.add(new Field({
    name: "program_day_key",
    type: "text",
    required: false,
  }))

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("cardio_sessions")
  collection.fields.removeByName("program")
  collection.fields.removeByName("program_day_key")
  app.save(collection)
})
