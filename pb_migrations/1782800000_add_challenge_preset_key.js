/// <reference path="../pb_data/types.d.ts" />

/** Persist the stable catalog identity used by idempotent beginner joins. */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("challenges")

  if (!collection.fields.find(f => f.name === "preset_key")) {
    collection.fields.push(new Field({
      "id": "text_challenge_preset_key",
      "name": "preset_key",
      "type": "text",
      "required": false,
      "hidden": false,
      "system": false,
      "max": 0,
      "min": 0,
      "pattern": "",
    }))
  }

  collection.indexes = collection.indexes || []
  if (!collection.indexes.some(i => i.includes("idx_challenges_creator_preset"))) {
    collection.indexes.push(
      "CREATE UNIQUE INDEX idx_challenges_creator_preset ON challenges (creator, preset_key) WHERE preset_key != ''"
    )
  }
  app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("challenges")
    collection.fields = collection.fields.filter(f => f.id !== "text_challenge_preset_key")
    collection.indexes = collection.indexes.filter(i => !i.includes("idx_challenges_creator_preset"))
    app.save(collection)
  } catch (e) {}
})
