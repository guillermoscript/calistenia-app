/// <reference path="../pb_data/types.d.ts" />

/**
 * Add age and sex fields to the users collection.
 *
 * The OnboardingFlow UI has been writing to these fields for a while, but no
 * migration ever added them to the schema — the writes were silently dropped
 * by PocketBase. This migration fixes that silent failure.
 *
 * See docs/specs/welmi-analysis-onboarding-flow-optimization.md (Phase A).
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")

  if (!users.fields.find(f => f.name === "age")) {
    users.fields.add(new Field({
      "hidden": false,
      "id": "number_user_age",
      "max": 120,
      "min": 13,
      "name": "age",
      "onlyInt": true,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }

  if (!users.fields.find(f => f.name === "sex")) {
    users.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_user_sex",
      "max": 0,
      "min": 0,
      "name": "sex",
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
    users.fields = users.fields.filter(f => f.id !== "number_user_age" && f.id !== "text_user_sex")
    app.save(users)
  } catch (e) {
    // Collection doesn't exist, ignore
  }
})
