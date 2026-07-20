/// <reference path="../pb_data/types.d.ts" />

/**
 * Salud del usuario (condiciones médicas + lesiones) en colección propia (#247).
 *
 * El fix GHSA-wwj3-9h95-wcpf marcó `medical_conditions`/`injuries` como
 * `hidden` en `users`: no se serializan ni se pueden escribir con token de
 * usuario, así que onboarding/perfil fallaban en silencio y los avisos por
 * lesión nunca recibían datos. Igual que edad/sexo → `nutrition_goals` (#243),
 * se mueven a una colección protegida per-user en vez de des-ocultarlos
 * (`users` es legible por cualquier usuario autenticado).
 *
 * Una fila por usuario (índice único en `user`); reglas fuertes con el patrón
 * de `nutrition_goals` (1781500000): create exige `body.user` propio y update
 * impide reasignar la fila a otro usuario.
 *
 * Backfill: copia lo que exista en `users` (leído server-side, donde `hidden`
 * no aplica) por si sobreviven registros pre-1780500001. Los campos viejos de
 * `users` se dejan intactos (limpieza opcional en migración aparte).
 */
migrate((app) => {
  try { app.findCollectionByNameOrId("user_health"); return } catch {}

  const collection = new Collection({
    name: "user_health",
    type: "base",
    fields: [
      { name: "user", type: "relation", required: true, collectionId: "_pb_users_auth_", maxSelect: 1, cascadeDelete: true },
      { name: "medical_conditions", type: "json", maxSize: 2000 },
      { name: "injuries", type: "json", maxSize: 2000 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_user_health_user ON user_health (user)"
    ],
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
    updateRule: 'user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)',
    deleteRule: "user = @request.auth.id",
  })
  app.save(collection)

  // Backfill desde `users`. Ojo JSVM: `get()` de un campo json devuelve bytes
  // crudos (JSONRaw), así que se lee como string y se parsea.
  const parseList = (rec, name) => {
    try {
      const parsed = JSON.parse(rec.getString(name) || "null")
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  }

  const saved = app.findCollectionByNameOrId("user_health")
  const pageSize = 500
  for (let page = 0; ; page++) {
    const users = app.findRecordsByFilter("users", "id != ''", "", pageSize, page * pageSize)
    if (!users.length) break
    for (const u of users) {
      const conditions = parseList(u, "medical_conditions")
      const injuries = parseList(u, "injuries")
      if (!conditions.length && !injuries.length) continue
      const rec = new Record(saved)
      rec.set("user", u.id)
      rec.set("medical_conditions", conditions)
      rec.set("injuries", injuries)
      app.save(rec)
    }
    if (users.length < pageSize) break
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId("user_health")
  app.delete(collection)
})
