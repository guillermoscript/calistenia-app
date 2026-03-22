/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("user_programs")
  // Allow any authenticated user to read (needed for social features - see what program friends use)
  collection.listRule = '@request.auth.id != ""'
  collection.viewRule = '@request.auth.id != ""'
  // Keep create/update/delete restricted to owner
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("user_programs")
  collection.listRule = "user = @request.auth.id"
  collection.viewRule = "user = @request.auth.id"
  app.save(collection)
})
