/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4000000004")

  // Idempotent: skip if fields already exist
  if (collection.fields.getByName("quality_score")) return

  collection.fields.add(new Field({
    autogeneratePattern: "",
    hidden: false,
    id: "text_nutrition_quality_score",
    max: 1,
    min: 0,
    name: "quality_score",
    pattern: "",
    presentable: false,
    primaryKey: false,
    required: false,
    system: false,
    type: "text",
  }))

  collection.fields.add(new Field({
    hidden: false,
    id: "json_nutrition_quality_breakdown",
    maxSize: 0,
    name: "quality_breakdown",
    presentable: false,
    required: false,
    system: false,
    type: "json",
  }))

  collection.fields.add(new Field({
    autogeneratePattern: "",
    hidden: false,
    id: "text_nutrition_quality_message",
    max: 500,
    min: 0,
    name: "quality_message",
    pattern: "",
    presentable: false,
    primaryKey: false,
    required: false,
    system: false,
    type: "text",
  }))

  collection.fields.add(new Field({
    hidden: false,
    id: "json_nutrition_quality_suggestion",
    maxSize: 0,
    name: "quality_suggestion",
    presentable: false,
    required: false,
    system: false,
    type: "json",
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4000000004")

  collection.fields.removeById("text_nutrition_quality_score")
  collection.fields.removeById("json_nutrition_quality_breakdown")
  collection.fields.removeById("text_nutrition_quality_message")
  collection.fields.removeById("json_nutrition_quality_suggestion")

  return app.save(collection)
})
