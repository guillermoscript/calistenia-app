/// <reference path="../pb_data/types.d.ts" />
/**
 * Allow authenticated users to search/list other users.
 * Needed for the Friends search feature.
 * Only display_name and email are exposed (PB hides sensitive auth fields by default).
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")
  collection.listRule = '@request.auth.id != ""'
  collection.viewRule = '@request.auth.id != ""'
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")
  collection.listRule = "id = @request.auth.id"
  collection.viewRule = "id = @request.auth.id"
  app.save(collection)
})
