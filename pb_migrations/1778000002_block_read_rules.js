/// <reference path="../pb_data/types.d.ts" />

/**
 * Enforcement de lectura del bloqueo (spec 2026-07-14). A cada colección
 * social se le añade la cláusula doble sobre el campo espejo blocked_users:
 *   <owner>.blocked_users.id != @request.auth.id  → el dueño no me bloqueó
 *   @request.auth.blocked_users.id != <owner>.id  → yo no bloqueé al dueño
 * Multi-relación con != = all-match ("no contiene"); lista vacía pasa.
 * NO se tocan las reglas de `users` (rompería expands de author/actor).
 */
const TARGETS = [
  // [colección, campo dueño, regla previa para el down]
  ["sessions", "user", '@request.auth.id != ""'],
  ["cardio_sessions", "user", '@request.auth.id != ""'],
  ["circuit_sessions", "user", "@request.auth.id != ''"],
  ["comments", "author", '@request.auth.id != ""'],
  ["feed_reactions", "reactor", '@request.auth.id != ""'],
  ["comment_reactions", "reactor", '@request.auth.id != ""'],
  ["user_stats", "user", '@request.auth.id != ""'],
  ["challenge_participants", "user", '@request.auth.id != ""'],
  ["challenges", "creator", '@request.auth.id != ""'],
]

migrate((app) => {
  for (const [name, owner] of TARGETS) {
    const collection = app.findCollectionByNameOrId(name)
    const rule = '@request.auth.id != "" && ' +
      owner + '.blocked_users.id != @request.auth.id && ' +
      '@request.auth.blocked_users.id != ' + owner + '.id'
    collection.listRule = rule
    collection.viewRule = rule
    app.save(collection)
  }
}, (app) => {
  for (const [name, , prevRule] of TARGETS) {
    try {
      const collection = app.findCollectionByNameOrId(name)
      collection.listRule = prevRule
      collection.viewRule = prevRule
      app.save(collection)
    } catch (e) {}
  }
})
