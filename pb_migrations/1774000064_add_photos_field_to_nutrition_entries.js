/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4000000004")

  // Add multi-photo field "photos" (maxSelect: 5)
  collection.fields.add(new Field({
    "hidden": false,
    "id": "file_nutrition_photos",
    "maxSelect": 5,
    "maxSize": 10485760,
    "mimeTypes": [
      "image/jpeg",
      "image/png",
      "image/webp"
    ],
    "name": "photos",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))

  // Remove old single-photo field
  collection.fields.removeById("file_nutrition_photo")

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4000000004")

  // Restore old single-photo field
  collection.fields.add(new Field({
    "hidden": false,
    "id": "file_nutrition_photo",
    "maxSelect": 1,
    "maxSize": 10485760,
    "mimeTypes": [
      "image/jpeg",
      "image/png",
      "image/webp"
    ],
    "name": "photo",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))

  // Remove multi-photo field
  collection.fields.removeById("file_nutrition_photos")

  return app.save(collection)
})
