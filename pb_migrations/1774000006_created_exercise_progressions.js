/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_4000000006")
  } catch (e) {
    collection = new Collection({
    "createRule": null,
    "deleteRule": null,
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_prog_exercise_id",
        "max": 0,
        "min": 0,
        "name": "exercise_id",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_prog_exercise_name",
        "max": 0,
        "min": 0,
        "name": "exercise_name",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_prog_category",
        "max": 0,
        "min": 0,
        "name": "category",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "number_prog_difficulty_order",
        "max": null,
        "min": 1,
        "name": "difficulty_order",
        "onlyInt": true,
        "presentable": false,
        "required": true,
        "system": false,
        "type": "number"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_prog_next_exercise_id",
        "max": 0,
        "min": 0,
        "name": "next_exercise_id",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_prog_prev_exercise_id",
        "max": 0,
        "min": 0,
        "name": "prev_exercise_id",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "number_prog_target_reps",
        "max": null,
        "min": 0,
        "name": "target_reps_to_advance",
        "onlyInt": true,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "number_prog_sessions_at_target",
        "max": null,
        "min": 0,
        "name": "sessions_at_target",
        "onlyInt": true,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      }
    ],
    "id": "pbc_4000000006",
    "indexes": [
      "CREATE INDEX idx_prog_exercise ON exercise_progressions (exercise_id)",
      "CREATE INDEX idx_prog_category ON exercise_progressions (category)"
    ],
    "listRule": "@request.auth.id != \"\"",
    "name": "exercise_progressions",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": "@request.auth.id != \"\""
  });
  }

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_4000000006");
    return app.delete(collection);
  } catch (e) {
    // Already deleted, ignore
  }
})
