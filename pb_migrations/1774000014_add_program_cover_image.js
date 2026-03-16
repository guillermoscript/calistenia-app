/// <reference path="../pb_data/types.d.ts" />

/**
 * Add cover_image field to programs collection for program card thumbnails.
 */
migrate((app) => {
  const programs = app.findCollectionByNameOrId("pbc_2970041692")

  programs.fields.push(new Field({
    "hidden": false,
    "id": "file_prog_cover",
    "maxSelect": 1,
    "maxSize": 5242880,
    "mimeTypes": ["image/jpeg", "image/png", "image/webp"],
    "name": "cover_image",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": ["400x0", "200x0"],
    "type": "file"
  }))

  app.save(programs)
}, (app) => {
  try {
    const programs = app.findCollectionByNameOrId("pbc_2970041692")
    programs.fields = programs.fields.filter(f => f.id !== "file_prog_cover")
    app.save(programs)
  } catch (e) {}
})
