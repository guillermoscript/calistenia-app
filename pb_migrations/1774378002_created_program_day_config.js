/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_4000000075")
  } catch (e) {
    collection = new Collection({
      "id": "pbc_4000000075",
      "name": "program_day_config",
      "type": "base",
      "system": false,
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
          "id": "relation_dayconfig_program",
          "maxSelect": 1,
          "minSelect": 1,
          "name": "program",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "relation"
        },
        {
          "hidden": false,
          "id": "number_dayconfig_phase",
          "max": null,
          "min": 0,
          "name": "phase_number",
          "onlyInt": true,
          "presentable": false,
          "required": true,
          "system": false,
          "type": "number"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text_dayconfig_day_id",
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
          "id": "text_dayconfig_day_name",
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
          "id": "text_dayconfig_day_type",
          "max": 0,
          "min": 0,
          "name": "day_type",
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
          "id": "text_dayconfig_day_focus",
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
          "id": "text_dayconfig_day_color",
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
          "id": "text_dayconfig_cardio_activity",
          "max": 0,
          "min": 0,
          "name": "cardio_activity_type",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "hidden": false,
          "id": "number_dayconfig_cardio_dist",
          "max": null,
          "min": 0,
          "name": "cardio_target_distance_km",
          "onlyInt": false,
          "presentable": false,
          "required": false,
          "system": false,
          "type": "number"
        },
        {
          "hidden": false,
          "id": "number_dayconfig_cardio_dur",
          "max": null,
          "min": 0,
          "name": "cardio_target_duration_min",
          "onlyInt": false,
          "presentable": false,
          "required": false,
          "system": false,
          "type": "number"
        },
        {
          "hidden": false,
          "id": "number_dayconfig_sort",
          "max": null,
          "min": 0,
          "name": "sort_order",
          "onlyInt": true,
          "presentable": false,
          "required": false,
          "system": false,
          "type": "number"
        }
      ],
      "indexes": [
        "CREATE UNIQUE INDEX idx_day_config_unique ON program_day_config (program, phase_number, day_id)"
      ],
      "listRule": "@request.auth.id != \"\"",
      "viewRule": "@request.auth.id != \"\"",
      "createRule": "@request.auth.id != \"\" && (program.created_by = @request.auth.id || @request.auth.role = \"admin\" || @request.auth.role = \"editor\")",
      "updateRule": "@request.auth.id != \"\" && (program.created_by = @request.auth.id || @request.auth.role = \"admin\" || @request.auth.role = \"editor\")",
      "deleteRule": "@request.auth.id != \"\" && (program.created_by = @request.auth.id || @request.auth.role = \"admin\" || @request.auth.role = \"editor\")"
    });
  }

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_4000000075");
    return app.delete(collection);
  } catch (e) {
    // Already deleted, ignore
  }
})
