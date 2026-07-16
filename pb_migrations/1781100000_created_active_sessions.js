/// <reference path="../pb_data/types.d.ts" />

/**
 * Sesión de fuerza EN CURSO, una por usuario (upsert continuo desde el
 * cliente). Permite reanudar la sesión en otro dispositivo (web ↔ mobile).
 * Se borra al completar/descartar; `sessions` sigue siendo solo el log de
 * sesiones completadas (completed_at requerido).
 */
migrate((app) => {
  try { app.findCollectionByNameOrId("active_sessions"); return } catch {}

  const collection = new Collection({
    name: "active_sessions",
    type: "base",
    fields: [
      { name: "user", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "workout", type: "json", required: true, maxSize: 2000000 },
      { name: "workout_key", type: "text", required: true },
      { name: "source", type: "text", required: true },
      { name: "progress", type: "json", required: true, maxSize: 500000 },
      { name: "started_at", type: "number", required: true },
      { name: "section_start_time", type: "number" },
      { name: "saved_at", type: "number", required: true },
      { name: "platform", type: "text" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_active_sessions_user ON active_sessions (user)"
    ],
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
    updateRule: "user = @request.auth.id",
    deleteRule: "user = @request.auth.id",
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("active_sessions")
  app.delete(collection)
})
