/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_3294601311")
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
        "cascadeDelete": true,
        "collectionId": "pbc_2970041692",
        "hidden": false,
        "id": "relation2465036164",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "program",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "hidden": false,
        "id": "number675752398",
        "max": null,
        "min": null,
        "name": "phase_number",
        "onlyInt": false,
        "presentable": false,
        "required": true,
        "system": false,
        "type": "number"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text163725606",
        "max": 0,
        "min": 0,
        "name": "day_id",
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
        "id": "text666286687",
        "max": 0,
        "min": 0,
        "name": "day_type",
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
        "id": "text4115370864",
        "max": 0,
        "min": 0,
        "name": "day_name",
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
        "id": "text3675125261",
        "max": 0,
        "min": 0,
        "name": "day_focus",
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
        "id": "text3751539725",
        "max": 0,
        "min": 0,
        "name": "day_color",
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
        "id": "text1929235327",
        "max": 0,
        "min": 0,
        "name": "workout_title",
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
        "id": "text3912537370",
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
        "id": "text117841076",
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
        "hidden": false,
        "id": "number2492286417",
        "max": null,
        "min": null,
        "name": "sets",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1214113712",
        "max": 0,
        "min": 0,
        "name": "reps",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "number480934094",
        "max": null,
        "min": null,
        "name": "rest_seconds",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text726147579",
        "max": 0,
        "min": 0,
        "name": "muscles",
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
        "id": "text3485334036",
        "max": 0,
        "min": 0,
        "name": "note",
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
        "id": "text4034435380",
        "max": 0,
        "min": 0,
        "name": "youtube",
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
        "id": "text1655102503",
        "max": 0,
        "min": 0,
        "name": "priority",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "bool640433514",
        "name": "is_timer",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
      },
      {
        "hidden": false,
        "id": "number2359676579",
        "max": null,
        "min": null,
        "name": "timer_seconds",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "number1169138922",
        "max": null,
        "min": null,
        "name": "sort_order",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      }
    ],
    "id": "pbc_3294601311",
    "indexes": [
      "CREATE INDEX idx_prog_ex_program ON program_exercises (program)",
      "CREATE INDEX idx_prog_ex_phase ON program_exercises (program, phase_number)",
      "CREATE INDEX idx_prog_ex_day ON program_exercises (program, phase_number, day_id)"
    ],
    "listRule": "@request.auth.id != \"\"",
    "name": "program_exercises",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": "@request.auth.id != \"\""
  });
  }

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_3294601311");
    return app.delete(collection);
  } catch (e) {
    // Already deleted, ignore
  }
})
