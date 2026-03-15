/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  let collection
  try {
    collection = app.findCollectionByNameOrId("pbc_2769025244")
  } catch (e) {
    return // Collection doesn't exist, skip
  }

  // add field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "number1764526770",
    "max": null,
    "min": null,
    "name": "pr_pullups",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(6, new Field({
    "hidden": false,
    "id": "number83762614",
    "max": null,
    "min": null,
    "name": "pr_pushups",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "number1237123324",
    "max": null,
    "min": null,
    "name": "pr_lsit",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "number1045517776",
    "max": null,
    "min": null,
    "name": "pr_pistol",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(9, new Field({
    "hidden": false,
    "id": "number2688772010",
    "max": null,
    "min": null,
    "name": "pr_handstand",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("pbc_2769025244")
    collection.fields.removeById("number1764526770")
    collection.fields.removeById("number83762614")
    collection.fields.removeById("number1237123324")
    collection.fields.removeById("number1045517776")
    collection.fields.removeById("number2688772010")
    return app.save(collection)
  } catch (e) {
    // Collection doesn't exist, ignore
  }
})
