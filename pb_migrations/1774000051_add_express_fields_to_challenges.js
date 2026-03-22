/// <reference path="../pb_data/types.d.ts" />

/**
 * Add express challenge fields to challenges collection.
 * Adds type (standard/express), exercise_id, daily_target, duration_days.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("challenges")

  // Find exercises_catalog collection ID for the relation
  let exerciseCollectionId
  try {
    const exercisesCol = app.findCollectionByNameOrId("exercises_catalog")
    exerciseCollectionId = exercisesCol.id
  } catch (e) {
    exerciseCollectionId = "exercises_catalog"
  }

  collection.fields.push(new Field({
    "hidden": false,
    "id": "select_challenge_type",
    "name": "type",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": ["standard", "express"]
  }))

  collection.fields.push(new Field({
    "hidden": false,
    "id": "relation_challenge_exercise",
    "name": "exercise_id",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation",
    "collectionId": exerciseCollectionId,
    "maxSelect": 1,
    "cascadeDelete": false
  }))

  collection.fields.push(new Field({
    "hidden": false,
    "id": "number_challenge_daily_target",
    "name": "daily_target",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number",
    "min": 0,
    "max": null
  }))

  collection.fields.push(new Field({
    "hidden": false,
    "id": "number_challenge_duration_days",
    "name": "duration_days",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number",
    "min": 1,
    "max": null,
    "onlyInt": true
  }))

  collection.indexes = collection.indexes || []
  collection.indexes.push("CREATE INDEX idx_challenges_type ON challenges (type)")

  app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("challenges")
    collection.fields = collection.fields.filter(f =>
      !["select_challenge_type", "relation_challenge_exercise", "number_challenge_daily_target", "number_challenge_duration_days"].includes(f.id)
    )
    collection.indexes = collection.indexes.filter(i => !i.includes("idx_challenges_type"))
    app.save(collection)
  } catch (e) {}
})
