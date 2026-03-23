/// <reference path="../pb_data/types.d.ts" />

/**
 * Security fixes for multiple collections:
 * - exercises_catalog: prevent status escalation (private→official/promoted)
 * - point_transactions: server-only creation (no client minting)
 * - notifications: server-only creation (prevent spoofed notifications)
 * - foods: admin-only update/delete (shared reference data)
 */
migrate((app) => {
  // C5: exercises_catalog — block status escalation on update
  const exercises = app.findCollectionByNameOrId("pbc_4000000001")
  exercises.updateRule = 'created_by = @request.auth.id && status = "private" && @request.body.status:isset = false'
  app.save(exercises)

  // C7: point_transactions — server-only creation
  const points = app.findCollectionByNameOrId("point_transactions")
  points.createRule = null
  app.save(points)

  // C9: notifications — server-only creation
  const notifications = app.findCollectionByNameOrId("notifications")
  notifications.createRule = null
  app.save(notifications)

  // C8: foods — admin-only update/delete
  const foods = app.findCollectionByNameOrId("foods")
  foods.updateRule = null
  foods.deleteRule = null
  app.save(foods)
}, (app) => {
  // Revert exercises_catalog updateRule
  const exercises = app.findCollectionByNameOrId("pbc_4000000001")
  exercises.updateRule = 'created_by = @request.auth.id'
  app.save(exercises)

  // Revert point_transactions createRule
  const points = app.findCollectionByNameOrId("point_transactions")
  points.createRule = '@request.auth.id != "" && @request.body.user = @request.auth.id'
  app.save(points)

  // Revert notifications createRule
  const notifications = app.findCollectionByNameOrId("notifications")
  notifications.createRule = '@request.auth.id != "" && @request.body.actor = @request.auth.id'
  app.save(notifications)

  // Revert foods update/delete rules
  const foods = app.findCollectionByNameOrId("foods")
  foods.updateRule = '@request.auth.id != ""'
  foods.deleteRule = '@request.auth.id != ""'
  app.save(foods)
})
