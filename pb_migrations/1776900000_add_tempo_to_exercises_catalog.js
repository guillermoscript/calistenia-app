/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("exercises_catalog")

  // Idempotency: skip if field already exists
  const existing = collection.fields.find(ef => ef.name === "tempo")
  if (existing) return

  collection.fields.add(new Field({
    name: "tempo",
    type: "json",
    required: false,
    maxSize: 1024,
  }))

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("exercises_catalog")

  collection.fields.removeByName("tempo")

  app.save(collection)
})
