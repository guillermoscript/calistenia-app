/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("exercises_catalog")

  // Additive only — do not touch existing fields.
  // Idempotency guard: each field is only added if absent.

  const imageFieldDef = {
    type: "file",
    required: false,
    maxSelect: 1,
    maxSize: 5242880,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  }

  const fields = [
    { name: "media_sequence",  ...imageFieldDef },
    { name: "media_muscles",   ...imageFieldDef },
    { name: "media_thumbnail", ...imageFieldDef },
  ]

  for (const fieldDef of fields) {
    const existing = collection.fields.find(ef => ef.name === fieldDef.name)
    if (existing) continue

    collection.fields.add(new Field(fieldDef))
  }

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("exercises_catalog")

  collection.fields.removeByName("media_sequence")
  collection.fields.removeByName("media_muscles")
  collection.fields.removeByName("media_thumbnail")

  app.save(collection)
})
