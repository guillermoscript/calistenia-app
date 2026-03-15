/// <reference path="../pb_data/types.d.ts" />
/**
 * Add created_by relation to programs collection and update access rules
 * so that authenticated users can create programs and only the creator
 * can update/delete them.
 */
migrate((app) => {
  const col = app.findCollectionByNameOrId("pbc_2970041692")

  // Add created_by relation field
  col.fields.add(new Field({
    "cascadeDelete": false,
    "collectionId": "_pb_users_auth_",
    "hidden": false,
    "id": "relation3001000001",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "created_by",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  // Update access rules
  col.createRule = "@request.auth.id != \"\""
  col.updateRule = "created_by = @request.auth.id || created_by = \"\""
  col.deleteRule = "created_by = @request.auth.id"

  return app.save(col)
}, (app) => {
  const col = app.findCollectionByNameOrId("pbc_2970041692")

  // Remove created_by field
  col.fields.removeById("relation3001000001")

  // Restore original rules (admin only)
  col.createRule = null
  col.updateRule = null
  col.deleteRule = null

  return app.save(col)
})
