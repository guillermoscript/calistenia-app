/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("sessions")

  const fields = [
    { name: "duration_seconds", type: "number", min: 0, onlyInt: true },
    { name: "poses_completed", type: "number", min: 0, onlyInt: true },
    { name: "total_poses", type: "number", min: 0, onlyInt: true },
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
    "duration_seconds",
    "poses_completed",
    "total_poses",
  ]

  for (const name of fieldNames) {
    collection.fields.removeByName(name)
  }

  app.save(collection)
})
