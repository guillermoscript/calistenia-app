/// <reference path="../pb_data/types.d.ts" />

/**
 * Add goal-related fields to the users collection (Phase B).
 *
 * - goal_weight: target weight in kg for progress tracking + meal plan calibration
 * - activity_level: baseline lifestyle activity (sedentary|light|active|very_active)
 *   Needed for accurate TDEE/calorie calculations in NutritionPage.
 * - pace: how aggressively the user wants to reach their goal
 *   (gradual|balanced|aggressive)
 *
 * See docs/specs/welmi-analysis-onboarding-flow-optimization.md (Phase B).
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")

  if (!users.fields.find(f => f.name === "goal_weight")) {
    users.fields.add(new Field({
      "hidden": false,
      "id": "number_user_goal_weight",
      "max": null,
      "min": 0,
      "name": "goal_weight",
      "onlyInt": false,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }

  if (!users.fields.find(f => f.name === "activity_level")) {
    users.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_user_activity_level",
      "max": 0,
      "min": 0,
      "name": "activity_level",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }

  if (!users.fields.find(f => f.name === "pace")) {
    users.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_user_pace",
      "max": 0,
      "min": 0,
      "name": "pace",
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
    const toRemove = ["number_user_goal_weight", "text_user_activity_level", "text_user_pace"]
    users.fields = users.fields.filter(f => !toRemove.includes(f.id))
    app.save(users)
  } catch (e) {}
})
