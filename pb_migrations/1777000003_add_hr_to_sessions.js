/// <reference path="../pb_data/types.d.ts" />

/**
 * Add watch-derived heart-rate + measured-calorie fields to the three session
 * collections, so session-detail views can show real HR/burn matched from the
 * health hub. App-owned rows, all nullable & additive.
 *
 * - hr_avg / hr_max: bpm, matched from health_samples HR series over the
 *   session's time window.
 * - calories_actual: kcal measured by the watch — distinct from the existing
 *   cardio_sessions.calories_burned MET *estimate*, which is kept as fallback.
 *
 * Applied to: sessions, cardio_sessions, circuit_sessions.
 */
migrate((app) => {
  const hrFields = (prefix) => [
    new Field({
      "hidden": false,
      "id": `number_${prefix}_hr_avg`,
      "max": 250,
      "min": 0,
      "name": "hr_avg",
      "onlyInt": true,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }),
    new Field({
      "hidden": false,
      "id": `number_${prefix}_hr_max`,
      "max": 250,
      "min": 0,
      "name": "hr_max",
      "onlyInt": true,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }),
    new Field({
      "hidden": false,
      "id": `number_${prefix}_cal_actual`,
      "max": null,
      "min": 0,
      "name": "calories_actual",
      "onlyInt": false,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    })
  ]

  const targets = [
    ["sessions", "sess"],
    ["cardio_sessions", "cardio"],
    ["circuit_sessions", "circuit"]
  ]

  for (const [name, prefix] of targets) {
    const collection = app.findCollectionByNameOrId(name)
    for (const field of hrFields(prefix)) {
      if (!collection.fields.find(f => f.name === field.name)) collection.fields.add(field)
    }
    app.save(collection)
  }
}, (app) => {
  const targets = [
    ["sessions", "sess"],
    ["cardio_sessions", "cardio"],
    ["circuit_sessions", "circuit"]
  ]
  for (const [name, prefix] of targets) {
    try {
      const collection = app.findCollectionByNameOrId(name)
      const ids = [`number_${prefix}_hr_avg`, `number_${prefix}_hr_max`, `number_${prefix}_cal_actual`]
      collection.fields = collection.fields.filter(f => !ids.includes(f.id))
      app.save(collection)
    } catch (e) {}
  }
})
