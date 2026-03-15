/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_1437074762");
    return app.delete(collection);
  } catch (e) {
    // Already deleted, ignore
  }
}, (app) => {
  const collection = new Collection({
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
        "collectionId": "_pb_users_auth_",
        "hidden": false,
        "id": "relation2375276105",
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
        "id": "number2982008523",
        "max": 4,
        "min": 1,
        "name": "phase",
        "onlyInt": false,
        "presentable": false,
        "required": true,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "date2502384312",
        "max": "",
        "min": "",
        "name": "start_date",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "number398808862",
        "max": 7,
        "min": 1,
        "name": "weekly_goal",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      }
    ],
    "id": "pbc_1437074762",
    "indexes": [],
    "listRule": null,
    "name": "settings_test",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": null
  });

  try {
    return app.save(collection);
  } catch (e) {
    // Already exists, ignore
  }
})
