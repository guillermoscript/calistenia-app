/// <reference path="../pb_data/types.d.ts" />
/**
 * Add created_by relation to programs collection and update access rules
 * so that authenticated users can create programs and only the creator
 * can update/delete them.
 */
migrate((app) => {
  let col
  try {
    col = app.findCollectionByNameOrId("pbc_2970041692")
  } catch (e) {
    return // Collection doesn't exist, skip
  }

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
  try {
    const col = app.findCollectionByNameOrId("pbc_2970041692")
    col.fields.removeById("relation3001000001")
    col.createRule = null
    col.updateRule = null
    col.deleteRule = null
    return app.save(col)
  } catch (e) {
    // Collection doesn't exist, ignore
  }
})
