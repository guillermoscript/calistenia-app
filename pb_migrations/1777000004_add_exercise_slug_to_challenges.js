/// <reference path="../pb_data/types.d.ts" />

/**
 * Per-exercise challenges: add `exercise_slug` (text) to challenges.
 *
 * Stores the catalog slug (sets_log.exercise_id / bundled exercise-catalog.json
 * id, e.g. "pullup_strict"). Intentionally NOT a relation to exercises_catalog:
 * the slug is the stable identity across environments (PB record ids differ
 * between local/prod and the catalog may not be fully seeded), and it matches
 * sets_log.exercise_id directly for score queries. The existing `exercise_id`
 * relation field stays as-is (used by express referral challenges).
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("challenges")

  collection.fields.push(new Field({
    "hidden": false,
    "id": "text_challenge_exercise_slug",
    "name": "exercise_slug",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "text",
    "max": 0,
    "min": 0,
    "pattern": "",
  }))

  app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("challenges")
    collection.fields = collection.fields.filter(f => f.id !== "text_challenge_exercise_slug")
    app.save(collection)
  } catch (e) {}
})
