/// <reference path="../pb_data/types.d.ts" />

/**
 * Integración con Strava (#914).
 *
 * `strava_connections` guarda los tokens OAuth de cada cuenta. Las cinco reglas
 * son `null` (solo superusuario): una regla de PocketBase filtra registros, no
 * campos, así que NO hay forma de dar al dueño lectura de su fila sin darle
 * también `access_token` y `refresh_token`. El cliente pregunta por el estado
 * de la conexión a `GET /api/strava/status`, que no devuelve tokens.
 *
 * `strava_uploads` registra qué sesión de cardio se subió y con qué id de
 * actividad. Aquí no hay secretos, así que el dueño puede LEER su fila (para
 * pintar «Ver en Strava») pero no escribirla: la escribe solo el servidor tras
 * hablar con Strava, y un cliente que pudiera crearla afirmaría que subió algo
 * que no subió.
 */
migrate((app) => {
  function createIfMissing(schema) {
    try {
      app.findCollectionByNameOrId(schema.name)
      return
    } catch (_) { /* no existe: se crea abajo */ }
    app.save(new Collection(schema))
  }

  createIfMissing({
    id: "pbc_strava_conn01", name: "strava_connections", type: "base",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      {
        id: "relation_stconn_user", name: "user", type: "relation", required: true,
        collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true,
      },
      { id: "number_stconn_athlete", name: "athlete_id", type: "number", onlyInt: true },
      { id: "text_stconn_access", name: "access_token", type: "text", required: true, max: 500 },
      { id: "text_stconn_refresh", name: "refresh_token", type: "text", required: true, max: 500 },
      { id: "number_stconn_expires", name: "expires_at", type: "number", required: true, onlyInt: true },
      { id: "text_stconn_scope", name: "scope", type: "text", max: 200 },
      { id: "autodate_stconn_created", name: "created", type: "autodate", onCreate: true },
      { id: "autodate_stconn_updated", name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_strava_conn_user ON strava_connections (user)",
    ],
  })

  createIfMissing({
    id: "pbc_strava_upl001", name: "strava_uploads", type: "base",
    listRule: 'user = @request.auth.id',
    viewRule: 'user = @request.auth.id',
    createRule: null, updateRule: null, deleteRule: null,
    fields: [
      {
        id: "relation_stupl_user", name: "user", type: "relation", required: true,
        collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true,
      },
      {
        id: "relation_stupl_session", name: "session", type: "relation", required: true,
        collectionId: app.findCollectionByNameOrId("cardio_sessions").id, maxSelect: 1, cascadeDelete: true,
      },
      { id: "number_stupl_upload", name: "upload_id", type: "number", onlyInt: true },
      { id: "number_stupl_activity", name: "activity_id", type: "number", onlyInt: true },
      { id: "select_stupl_status", name: "status", type: "select", required: true, maxSelect: 1,
        values: ["processing", "done", "failed"] },
      { id: "text_stupl_error", name: "error", type: "text", max: 500 },
      { id: "autodate_stupl_created", name: "created", type: "autodate", onCreate: true },
      { id: "autodate_stupl_updated", name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_strava_upl_session ON strava_uploads (session)",
      "CREATE INDEX idx_strava_upl_user ON strava_uploads (user)",
    ],
  })
}, (app) => {
  for (const name of ["strava_uploads", "strava_connections"]) {
    try { app.delete(app.findCollectionByNameOrId(name)) } catch (_) { /* ya no está */ }
  }
})
