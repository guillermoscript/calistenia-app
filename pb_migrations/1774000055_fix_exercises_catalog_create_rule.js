/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4000000001")

  // Fix createRule: users can only create private exercises under their own ID
  // Previous rule was too permissive: '@request.auth.id != ""'
  collection.createRule = '@request.auth.id != "" && @request.body.created_by = @request.auth.id && @request.body.status = "private"'

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4000000001")

  // Revert to the rule from migration 1774000054
  collection.createRule = '@request.auth.id != ""'

  return app.save(collection)
})
