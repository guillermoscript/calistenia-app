/// <reference path="../pb_data/types.d.ts" />

/**
 * Add avatar file field to users collection for profile pictures.
 * Supports Google OAuth avatars and manual uploads.
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")

  // Skip if avatar field already exists (PocketBase includes it by default)
  const existing = users.fields.find(f => f.name === "avatar")
  if (existing) {
    // Update thumbs on the existing field
    existing.thumbs = ["100x100", "200x200"]
    existing.maxSize = 5242880
    existing.mimeTypes = ["image/jpeg", "image/png", "image/webp"]
    app.save(users)
    return
  }

  users.fields.push(new Field({
    "hidden": false,
    "id": "file_user_avatar",
    "maxSelect": 1,
    "maxSize": 5242880,
    "mimeTypes": ["image/jpeg", "image/png", "image/webp"],
    "name": "avatar",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": ["100x100", "200x200"],
    "type": "file"
  }))

  app.save(users)
}, (app) => {
  try {
    const users = app.findCollectionByNameOrId("_pb_users_auth_")
    users.fields = users.fields.filter(f => f.id !== "file_user_avatar")
    app.save(users)
  } catch (e) {}
})
