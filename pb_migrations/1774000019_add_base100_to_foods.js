/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("foods")
  } catch (e) {
    // Collection doesn't exist yet — create it with all needed fields
    collection = new Collection({
      "createRule": "@request.auth.id != \"\"",
      "deleteRule": "@request.auth.id != \"\"",
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
          "id": "text_foods_name",
          "max": 0,
          "min": 0,
          "name": "name",
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
          "id": "text_foods_name_display",
          "max": 0,
          "min": 0,
          "name": "name_display",
          "pattern": "",
          "presentable": true,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text_foods_portion",
          "max": 0,
          "min": 0,
          "name": "portion",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "hidden": false,
          "id": "number_foods_calories",
          "max": null,
          "min": 0,
          "name": "calories",
          "onlyInt": false,
          "presentable": false,
          "required": false,
          "system": false,
          "type": "number"
        },
        {
          "hidden": false,
          "id": "number_foods_protein",
          "max": null,
          "min": 0,
          "name": "protein",
          "onlyInt": false,
          "presentable": false,
          "required": false,
          "system": false,
          "type": "number"
        },
        {
          "hidden": false,
          "id": "number_foods_carbs",
          "max": null,
          "min": 0,
          "name": "carbs",
          "onlyInt": false,
          "presentable": false,
          "required": false,
          "system": false,
          "type": "number"
        },
        {
          "hidden": false,
          "id": "number_foods_fat",
          "max": null,
          "min": 0,
          "name": "fat",
          "onlyInt": false,
          "presentable": false,
          "required": false,
          "system": false,
          "type": "number"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text_foods_category",
          "max": 0,
          "min": 0,
          "name": "category",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        },
        {
          "hidden": false,
          "id": "json_foods_tags",
          "maxSize": 0,
          "name": "tags",
          "presentable": false,
          "required": false,
          "system": false,
          "type": "json"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text_foods_source",
          "max": 0,
          "min": 0,
          "name": "source",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": false,
          "system": false,
          "type": "text"
        }
      ],
      "id": "pbc_foods_001",
      "indexes": [
        "CREATE UNIQUE INDEX idx_foods_name ON foods (name)"
      ],
      "listRule": "",
      "name": "foods",
      "system": false,
      "type": "base",
      "updateRule": "@request.auth.id != \"\"",
      "viewRule": ""
    })
  }

  // Add base100 fields
  const base100Fields = [
    { id: "number_base_cal_100", name: "base_cal_100" },
    { id: "number_base_prot_100", name: "base_prot_100" },
    { id: "number_base_carbs_100", name: "base_carbs_100" },
    { id: "number_base_fat_100", name: "base_fat_100" },
  ]

  for (const f of base100Fields) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": f.id,
      "max": null,
      "min": 0,
      "name": f.name,
      "onlyInt": false,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }

  return app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("foods")
    const fieldNames = ["base_cal_100", "base_prot_100", "base_carbs_100", "base_fat_100"]
    for (const name of fieldNames) {
      collection.fields.removeByName(name)
    }
    return app.save(collection)
  } catch (e) {
    // Collection doesn't exist, nothing to roll back
  }
})
