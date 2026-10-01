/// <reference path="../pb_data/types.d.ts" />

/**
 * Canal de email mínimo (#810): baja por usuario + registro de envíos.
 *
 * 1. `users.email_opt_out` (bool). Modelo opt-out, igual que los push: sin
 *    marcar = se puede enviar. Va en `users` y NO en `notification_prefs`
 *    a propósito: el enlace de baja tiene que poder guardar la baja de alguien
 *    que no tiene fila de preferencias, y crear esa fila desde el servidor la
 *    dejaría con todos sus bool en `false` — es decir, con TODOS los push
 *    apagados. Un bool en `users` cuyo valor por defecto (false) ya significa
 *    «sí a los emails» no tiene esa trampa. Nace oculto para terceros
 *    (`users_field_privacy.pb.js` es lista blanca); lo lee y escribe el
 *    superusuario del AI API.
 *
 * 2. Colección `email_log`: una fila por email enviado (`user`, `kind`,
 *    `campaign`). Sirve de dedupe para `mcp-server/src/api/email-dispatcher.ts`
 *    y de tope diario (el plan gratis de Resend son 100 al día). Sin reglas de
 *    API: solo la toca el superusuario. Se borra en cascada con el usuario.
 *
 * IDEMPOTENTE: no toca nada que ya exista. `id` de campos y colección FIJOS
 * (feedback_migration_safety).
 */

const OPT_OUT_FIELD_ID = "bool_users_email_opt_out"
const LOG_ID = "pbc_email_log_810"

migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")
  if (!users.fields.find(f => f.name === "email_opt_out")) {
    users.fields.add(new Field({
      "hidden": false,
      "id": OPT_OUT_FIELD_ID,
      "name": "email_opt_out",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "bool"
    }))
    app.save(users)
    console.log("[email_channel] campo users.email_opt_out añadido")
  }

  let exists = true
  try { app.findCollectionByNameOrId("email_log") } catch (_) { exists = false }
  if (exists) return

  const log = new Collection({
    "id": LOG_ID,
    "name": "email_log",
    "type": "base",
    "system": false,
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "cascadeDelete": true,
        "collectionId": "_pb_users_auth_",
        "hidden": false,
        "id": "relation_email_log_user",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "user",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_email_log_kind",
        "max": 60,
        "min": 0,
        "name": "kind",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_email_log_campaign",
        "max": 100,
        "min": 0,
        "name": "campaign",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "autodate_email_log_created",
        "name": "created",
        "onCreate": true,
        "onUpdate": false,
        "presentable": false,
        "system": false,
        "type": "autodate"
      }
    ],
    "indexes": [
      "CREATE INDEX `idx_email_log_user_kind` ON `email_log` (`user`, `kind`)",
      "CREATE INDEX `idx_email_log_created` ON `email_log` (`created`)"
    ]
  })
  app.save(log)
  console.log("[email_channel] colección email_log creada")
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("email_log")) } catch (_) {}
  const users = app.findCollectionByNameOrId("_pb_users_auth_")
  users.fields.removeById(OPT_OUT_FIELD_ID)
  app.save(users)
})
