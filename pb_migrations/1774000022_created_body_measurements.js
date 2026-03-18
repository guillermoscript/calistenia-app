/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_body_meas_001")
  } catch (e) {
    collection = new Collection({
      "createRule": "@request.auth.id != \"\"",
      "deleteRule": "user = @request.auth.id",
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
          "collectionId": "_pb_users_auth_",
          "hidden": false,
          "id": "relation_bm_user",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "user",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "relation"
        },
        {
          "hidden": false,
          "id": "date_bm_date",
          "max": "",
          "min": "",
          "name": "date",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "date"
        },
        {
          "hidden": false, "id": "number_bm_chest", "max": null, "min": 0, "name": "chest",
          "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number"
        },
        {
          "hidden": false, "id": "number_bm_waist", "max": null, "min": 0, "name": "waist",
          "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number"
        },
        {
          "hidden": false, "id": "number_bm_hips", "max": null, "min": 0, "name": "hips",
          "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number"
        },
        {
          "hidden": false, "id": "number_bm_arm_left", "max": null, "min": 0, "name": "arm_left",
          "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number"
        },
        {
          "hidden": false, "id": "number_bm_arm_right", "max": null, "min": 0, "name": "arm_right",
          "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number"
        },
        {
          "hidden": false, "id": "number_bm_thigh_left", "max": null, "min": 0, "name": "thigh_left",
          "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number"
        },
        {
          "hidden": false, "id": "number_bm_thigh_right", "max": null, "min": 0, "name": "thigh_right",
          "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number"
        },
        {
          "autogeneratePattern": "", "hidden": false, "id": "text_bm_note", "max": 0, "min": 0,
          "name": "note", "pattern": "", "presentable": false, "primaryKey": false,
          "required": false, "system": false, "type": "text"
        }
      ],
      "id": "pbc_body_meas_001",
      "indexes": [
        "CREATE INDEX idx_bm_user ON body_measurements (user)",
        "CREATE INDEX idx_bm_user_date ON body_measurements (user, date)"
      ],
      "listRule": "user = @request.auth.id",
      "name": "body_measurements",
      "system": false,
      "type": "base",
      "updateRule": "user = @request.auth.id",
      "viewRule": "user = @request.auth.id"
    });
  }

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_body_meas_001");
    return app.delete(collection);
  } catch (e) {}
})
