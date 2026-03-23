/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4000000001")

  // Add created_by field (relation to users)
  collection.fields.add(new Field({
    name: "created_by",
    type: "relation",
    required: false,
    collectionId: "_pb_users_auth_",
    maxSelect: 1,
    cascadeDelete: false,
  }))

  // Add status field (select: official/private/promoted)
  collection.fields.add(new Field({
    name: "status",
    type: "select",
    required: false,
    values: ["official", "private", "promoted"],
    maxSelect: 1,
  }))

  // Add variant_of field (self-referential relation)
  collection.fields.add(new Field({
    name: "variant_of",
    type: "relation",
    required: false,
    collectionId: "pbc_4000000001",
    maxSelect: 1,
    cascadeDelete: false,
  }))

  // Add promoted_from field (self-referential relation)
  collection.fields.add(new Field({
    name: "promoted_from",
    type: "relation",
    required: false,
    collectionId: "pbc_4000000001",
    maxSelect: 1,
    cascadeDelete: false,
  }))

  // Update API rules
  collection.listRule = '@request.auth.id != "" && (status = "official" || status = "promoted" || created_by = @request.auth.id)'
  collection.viewRule = '@request.auth.id != "" && (status = "official" || status = "promoted" || created_by = @request.auth.id)'
  collection.createRule = '@request.auth.id != "" && @request.body.created_by = @request.auth.id && @request.body.status = "private"'
  collection.updateRule = 'created_by = @request.auth.id'
  collection.deleteRule = 'created_by = @request.auth.id && status = "private"'

  // Add index on status + created_by
  collection.indexes.push("CREATE INDEX idx_catalog_status_user ON exercises_catalog (status, created_by)")

  app.save(collection)

  // Backfill: set status = "official" for all existing records
  app.db().newQuery('UPDATE exercises_catalog SET status = "official" WHERE status IS NULL OR status = ""').execute()
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4000000001")

  // Remove fields
  collection.fields.removeByName("created_by")
  collection.fields.removeByName("status")
  collection.fields.removeByName("variant_of")
  collection.fields.removeByName("promoted_from")

  // Restore original API rules (after migration 1774000048)
  collection.listRule = '@request.auth.id != ""'
  collection.viewRule = '@request.auth.id != ""'
  collection.createRule = '@request.auth.id != ""'
  collection.updateRule = '@request.auth.id != ""'
  collection.deleteRule = null

  // Remove index
  collection.indexes = collection.indexes.filter(idx => !idx.includes("idx_catalog_status_user"))

  return app.save(collection)
})
