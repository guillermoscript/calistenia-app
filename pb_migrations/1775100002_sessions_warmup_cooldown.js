/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("sessions")

  const fields = [
    { name: "warmup_completed", type: "bool" },
    { name: "warmup_skipped", type: "bool" },
    { name: "warmup_duration_seconds", type: "number", min: 0, onlyInt: true },
    { name: "cooldown_completed", type: "bool" },
    { name: "cooldown_skipped", type: "bool" },
    { name: "cooldown_duration_seconds", type: "number", min: 0, onlyInt: true },
  ]

  for (const f of fields) {
    // Idempotency: skip if field already exists
    const existing = collection.fields.find(ef => ef.name === f.name)
    if (existing) continue

    collection.fields.add(new Field(f))
  }

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("sessions")

  const fieldNames = [
    "warmup_completed",
    "warmup_skipped",
    "warmup_duration_seconds",
    "cooldown_completed",
    "cooldown_skipped",
    "cooldown_duration_seconds",
  ]

  for (const name of fieldNames) {
    collection.fields.removeByName(name)
  }

  app.save(collection)
})
