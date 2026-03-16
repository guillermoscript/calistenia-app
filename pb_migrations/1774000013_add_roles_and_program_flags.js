/// <reference path="../pb_data/types.d.ts" />

/**
 * Add role/tier fields to users and is_official/is_featured/difficulty to programs.
 * Updates API rules for role-based access.
 */
migrate((app) => {
  // ── 1. Add role + tier to users ──────────────────────────────────────────
  const users = app.findCollectionByNameOrId("_pb_users_auth_")

  users.fields.push(new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text_user_role",
    "max": 20,
    "min": 0,
    "name": "role",
    "pattern": "^(user|editor|admin)$",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  users.fields.push(new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text_user_tier",
    "max": 20,
    "min": 0,
    "name": "tier",
    "pattern": "^(free|premium)$",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  app.save(users)

  // ── 2. Add is_official, is_featured, difficulty to programs ──────────────
  const programs = app.findCollectionByNameOrId("pbc_2970041692")

  programs.fields.push(new Field({
    "hidden": false,
    "id": "bool_prog_official",
    "name": "is_official",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  programs.fields.push(new Field({
    "hidden": false,
    "id": "bool_prog_featured",
    "name": "is_featured",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  programs.fields.push(new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text_prog_difficulty",
    "max": 20,
    "min": 0,
    "name": "difficulty",
    "pattern": "^(beginner|intermediate|advanced)$",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // Update programs rules:
  // - Anyone authenticated can list/view
  // - Create: authenticated users
  // - Update: creator OR admin/editor (for is_official/is_featured)
  programs.updateRule = '@request.auth.id != "" && (created_by = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "editor")'

  app.save(programs)

  // ── 3. Make user_stats viewable by anyone authenticated (for profiles) ──
  try {
    const userStats = app.findCollectionByNameOrId("pbc_4000000012")
    userStats.viewRule = '@request.auth.id != ""'
    userStats.listRule = '@request.auth.id != ""'
    app.save(userStats)
  } catch (e) {
    // user_stats might not exist yet
  }

}, (app) => {
  // Rollback: remove added fields
  try {
    const users = app.findCollectionByNameOrId("_pb_users_auth_")
    users.fields = users.fields.filter(f => f.id !== "text_user_role" && f.id !== "text_user_tier")
    app.save(users)
  } catch (e) {}

  try {
    const programs = app.findCollectionByNameOrId("pbc_2970041692")
    programs.fields = programs.fields.filter(f =>
      f.id !== "bool_prog_official" && f.id !== "bool_prog_featured" && f.id !== "text_prog_difficulty"
    )
    programs.updateRule = 'created_by = @request.auth.id || created_by = ""'
    app.save(programs)
  } catch (e) {}
})
