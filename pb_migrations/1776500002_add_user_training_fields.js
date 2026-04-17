/// <reference path="../pb_data/types.d.ts" />

/**
 * Add training-preference fields to the users collection (Phase B).
 *
 * - focus_areas: JSON array of muscle groups / skills the user wants to focus
 *   on (full_body, upper_body, core, pull_ups, handstand, ...). Drives program
 *   recommendation scoring.
 * - training_days: JSON array of weekday IDs (mon..sun) the user plans to
 *   train. Used for schedule personalization and reminders.
 * - intensity: preferred session intensity (light|moderate|intense).
 *   Sits alongside `level` (skill) as a separate axis.
 *
 * See docs/specs/welmi-analysis-onboarding-flow-optimization.md (Phase B).
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")

  if (!users.fields.find(f => f.name === "focus_areas")) {
    users.fields.add(new Field({
      "hidden": false,
      "id": "json_user_focus_areas",
      "maxSize": 2000,
      "name": "focus_areas",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    }))
  }

  if (!users.fields.find(f => f.name === "training_days")) {
    users.fields.add(new Field({
      "hidden": false,
      "id": "json_user_training_days",
      "maxSize": 2000,
      "name": "training_days",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    }))
  }

  if (!users.fields.find(f => f.name === "intensity")) {
    users.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_user_intensity",
      "max": 0,
      "min": 0,
      "name": "intensity",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }

  app.save(users)
}, (app) => {
  try {
    const users = app.findCollectionByNameOrId("_pb_users_auth_")
    const toRemove = ["json_user_focus_areas", "json_user_training_days", "text_user_intensity"]
    users.fields = users.fields.filter(f => !toRemove.includes(f.id))
    app.save(users)
  } catch (e) {}
})
