/// <reference path="../pb_data/types.d.ts" />

/**
 * Add optional meal-timing fields to nutrition_entries.
 *
 * - eaten_at: the wall-clock time the user actually finished the meal. Distinct
 *   from logged_at (an onCreate autodate = when the record was created), so the
 *   user can log a meal later but record when they really ate it. Plain `date`
 *   (NOT autodate) so the client-supplied value is persisted. Optional — old
 *   entries and quick logs fall back to logged_at for display.
 * - duration_min: how long the meal took, in minutes. Optional, integer >= 0.
 *
 * Both are additive and nullable, so existing rows are unaffected.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("nutrition_entries")

  if (!collection.fields.find(f => f.name === "eaten_at")) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "date_nutrition_eaten_at",
      "max": "",
      "min": "",
      "name": "eaten_at",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "date"
    }))
  }

  if (!collection.fields.find(f => f.name === "duration_min")) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "number_nutrition_duration_min",
      "max": null,
      "min": 0,
      "name": "duration_min",
      "onlyInt": true,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }

  app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("nutrition_entries")
    const toRemove = ["date_nutrition_eaten_at", "number_nutrition_duration_min"]
    collection.fields = collection.fields.filter(f => !toRemove.includes(f.id))
    app.save(collection)
  } catch (e) {}
})
