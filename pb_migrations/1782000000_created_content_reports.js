/// <reference path="../pb_data/types.d.ts" />

/**
 * Denuncias de contenido/usuarios (#220, política UGC de Google Play).
 * Solo-escritura para usuarios: cualquier autenticado crea su denuncia
 * (reporter = él mismo), nadie las lee ni edita vía API — la revisión es
 * manual desde el dashboard de PB. `comment_text` guarda un snapshot del
 * texto denunciado para que la revisión sobreviva al borrado del comentario
 * (por eso `comment` NO usa cascadeDelete).
 */
migrate((app) => {
  try { app.findCollectionByNameOrId("content_reports"); return } catch {}

  const comments = app.findCollectionByNameOrId("comments")

  const collection = new Collection({
    name: "content_reports",
    type: "base",
    fields: [
      { name: "reporter", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "target_type", type: "select", required: true, maxSelect: 1, values: ["user", "comment"] },
      { name: "target_user", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: false },
      { name: "comment", type: "relation", required: false, collectionId: comments.id, maxSelect: 1, cascadeDelete: false },
      { name: "comment_text", type: "text", required: false, max: 500 },
      { name: "session_id", type: "text", required: false },
      { name: "reason", type: "select", required: true, maxSelect: 1, values: ["spam", "harassment", "inappropriate", "other"] },
      { name: "details", type: "text", required: false, max: 500 },
      { name: "status", type: "select", required: false, maxSelect: 1, values: ["pending", "reviewed", "actioned", "dismissed"] },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_content_reports_dedupe ON content_reports (reporter, target_type, target_user, comment)",
      "CREATE INDEX idx_content_reports_target_user ON content_reports (target_user)",
      "CREATE INDEX idx_content_reports_status ON content_reports (status)",
    ],
    listRule: null,
    viewRule: null,
    createRule: '@request.auth.id != "" && @request.body.reporter = @request.auth.id && @request.body.target_user != @request.auth.id && @request.body.status:isset = false && (@request.body.target_type = "user" || @request.body.comment != "")',
    updateRule: null,
    deleteRule: null,
  })
  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("content_reports")
  app.delete(collection)
})
