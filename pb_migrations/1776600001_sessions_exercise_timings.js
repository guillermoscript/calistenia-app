/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("sessions")

  // exercise_timings: ordered array of { exerciseId, exerciseName, seconds }
  const fields = [
    { name: "exercise_timings", type: "json", maxSize: 50000 },
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

  collection.fields.removeByName("exercise_timings")

  app.save(collection)
})
