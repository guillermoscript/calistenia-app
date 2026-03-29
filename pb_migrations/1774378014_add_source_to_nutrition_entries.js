/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4000000004")

  collection.fields.add(new Field({
    autogeneratePattern: "",
    hidden: false,
    id: "text_nutrition_source",
    max: 50,
    min: 0,
    name: "source",
    pattern: "",
    presentable: false,
    primaryKey: false,
    required: false,
    system: false,
    type: "text",
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4000000004")

  collection.fields.removeById("text_nutrition_source")

  return app.save(collection)
})
