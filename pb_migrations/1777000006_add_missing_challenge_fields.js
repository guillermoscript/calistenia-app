/// <reference path="../pb_data/types.d.ts" />

/**
 * Backfill challenge fields the create form has always sent but no migration
 * ever defined (PocketBase silently drops unknown body fields, so custom
 * metric names, descriptions and goals were being lost on any instance built
 * purely from migrations). Defensive: skips any field that already exists
 * (e.g. added by hand through the dashboard).
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("challenges")
  const has = (name) => collection.fields.find(f => f.name === name)

  if (!has("custom_metric")) {
    collection.fields.push(new Field({
      "id": "text_challenge_custom_metric",
      "name": "custom_metric",
      "type": "text",
      "required": false,
      "hidden": false,
      "system": false,
      "max": 0,
      "min": 0,
      "pattern": "",
    }))
  }

  if (!has("description")) {
    collection.fields.push(new Field({
      "id": "text_challenge_description",
      "name": "description",
      "type": "text",
      "required": false,
      "hidden": false,
      "system": false,
      "max": 0,
      "min": 0,
      "pattern": "",
    }))
  }

  if (!has("goal")) {
    collection.fields.push(new Field({
      "id": "number_challenge_goal",
      "name": "goal",
      "type": "number",
      "required": false,
      "hidden": false,
      "system": false,
      "min": 0,
      "max": null,
    }))
  }

  app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("challenges")
    collection.fields = collection.fields.filter(f =>
      !["text_challenge_custom_metric", "text_challenge_description", "number_challenge_goal"].includes(f.id)
    )
    app.save(collection)
  } catch (e) {}
})
