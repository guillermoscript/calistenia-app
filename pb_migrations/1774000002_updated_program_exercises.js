/// <reference path="../pb_data/types.d.ts" />
/**
 * Add demo_images and demo_video file fields to program_exercises.
 * Allows per-exercise media overrides (images + video).
 */
migrate((app) => {
  let col
  try {
    col = app.findCollectionByNameOrId("pbc_3294601311")
  } catch (e) {
    return // Collection doesn't exist, skip
  }

  col.fields.add(new Field({
    "hidden": false,
    "id": "file2001000001",
    "maxSelect": 3,
    "maxSize": 5242880,
    "mimeTypes": [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ],
    "name": "demo_images",
    "presentable": false,
    "required": false,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))

  col.fields.add(new Field({
    "hidden": false,
    "id": "file2001000002",
    "maxSelect": 1,
    "maxSize": 52428800,
    "mimeTypes": [
      "video/mp4",
      "video/webm"
    ],
    "name": "demo_video",
    "presentable": false,
    "required": false,
    "system": false,
    "thumbs": [],
    "type": "file"
  }))

  return app.save(col)
}, (app) => {
  try {
    const col = app.findCollectionByNameOrId("pbc_3294601311")
    col.fields.removeById("file2001000001")
    col.fields.removeById("file2001000002")
    return app.save(col)
  } catch (e) {
    // Collection doesn't exist, ignore
  }
})
