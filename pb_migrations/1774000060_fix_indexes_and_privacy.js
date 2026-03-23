/// <reference path="../pb_data/types.d.ts" />

/**
 * Security hardening migration:
 * - H4: Make exercises_catalog slug index UNIQUE
 * - H5: Add index on programs.created_by
 * - M4: Add index on users.role
 * - H6: Restrict settings listRule/viewRule to owner only
 * - H8: Restrict user_stats listRule/viewRule to authenticated users only
 */
migrate((app) => {
  // H4: Make exercises_catalog slug index UNIQUE
  const catalog = app.findCollectionByNameOrId("exercises_catalog")
  catalog.indexes = catalog.indexes.filter(idx => !idx.includes("idx_catalog_slug"))
  catalog.indexes.push("CREATE UNIQUE INDEX idx_catalog_slug ON exercises_catalog (slug)")
  app.save(catalog)

  // H5: Add index on programs.created_by
  const programs = app.findCollectionByNameOrId("programs")
  programs.indexes.push("CREATE INDEX idx_programs_created_by ON programs (created_by)")
  app.save(programs)

  // M4: Add index on users.role
  const users = app.findCollectionByNameOrId("users")
  users.indexes.push("CREATE INDEX idx_users_role ON users (role)")
  app.save(users)

  // H6: Restrict settings to owner only
  const settings = app.findCollectionByNameOrId("settings")
  settings.listRule = 'user = @request.auth.id'
  settings.viewRule = 'user = @request.auth.id'
  app.save(settings)

  // H8: Restrict user_stats to authenticated users only
  const userStats = app.findCollectionByNameOrId("user_stats")
  userStats.listRule = '@request.auth.id != ""'
  userStats.viewRule = '@request.auth.id != ""'
  app.save(userStats)
}, (app) => {
  // Revert H4: restore non-unique slug index
  const catalog = app.findCollectionByNameOrId("exercises_catalog")
  catalog.indexes = catalog.indexes.filter(idx => !idx.includes("idx_catalog_slug"))
  catalog.indexes.push("CREATE INDEX idx_catalog_slug ON exercises_catalog (slug)")
  app.save(catalog)

  // Revert H5: remove programs.created_by index
  const programs = app.findCollectionByNameOrId("programs")
  programs.indexes = programs.indexes.filter(idx => !idx.includes("idx_programs_created_by"))
  app.save(programs)

  // Revert M4: remove users.role index
  const users = app.findCollectionByNameOrId("users")
  users.indexes = users.indexes.filter(idx => !idx.includes("idx_users_role"))
  app.save(users)

  // Revert H6: restore settings to any authenticated user
  const settings = app.findCollectionByNameOrId("settings")
  settings.listRule = '@request.auth.id != ""'
  settings.viewRule = '@request.auth.id != ""'
  app.save(settings)

  // Revert H8: restore user_stats to fully public
  const userStats = app.findCollectionByNameOrId("user_stats")
  userStats.listRule = ''
  userStats.viewRule = ''
  app.save(userStats)
})
