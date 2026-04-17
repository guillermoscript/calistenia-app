/// <reference path="../pb_data/types.d.ts" />

/**
 * Add health-related fields to the users collection (Phase B).
 *
 * - medical_conditions: JSON array of conditions (heart, diabetes, etc.).
 *   Drives the health disclaimer shown during onboarding and nutrition setup.
 * - injuries: JSON array of current injuries / limitations.
 *   Used to flag or hide contraindicated exercises in the workout view.
 *
 * Both default to empty arrays; the onboarding "No issues" shortcut leaves
 * them empty.
 *
 * See docs/specs/welmi-analysis-onboarding-flow-optimization.md (Phase B).
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")

  if (!users.fields.find(f => f.name === "medical_conditions")) {
    users.fields.add(new Field({
      "hidden": false,
      "id": "json_user_medical_conditions",
      "maxSize": 2000,
      "name": "medical_conditions",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    }))
  }

  if (!users.fields.find(f => f.name === "injuries")) {
    users.fields.add(new Field({
      "hidden": false,
      "id": "json_user_injuries",
      "maxSize": 2000,
      "name": "injuries",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    }))
  }

  app.save(users)
}, (app) => {
  try {
    const users = app.findCollectionByNameOrId("_pb_users_auth_")
    const toRemove = ["json_user_medical_conditions", "json_user_injuries"]
    users.fields = users.fields.filter(f => !toRemove.includes(f.id))
    app.save(users)
  } catch (e) {}
})
