/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("program_exercises")

  // Idempotency: skip if field already exists
  const existing = collection.fields.find(f => f.name === "section")
  if (existing) return

  collection.fields.add(new Field({
    name: "section",
    type: "text",
    required: false,
  }))

  app.save(collection)

  // Backfill: set default value for existing records
  app.db().newQuery('UPDATE program_exercises SET section = "main" WHERE section IS NULL OR section = ""').execute()
}, (app) => {
  const collection = app.findCollectionByNameOrId("program_exercises")
  collection.fields.removeByName("section")
  app.save(collection)
})
