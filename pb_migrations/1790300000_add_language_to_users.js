/// <reference path="../pb_data/types.d.ts" />

/**
 * Idioma del usuario: `users.language` (#804).
 *
 * Ningún push respetaba el idioma porque el servidor no lo conocía: el copy de
 * los dispatchers y de los hooks estaba en español fijo. Lo escribe el cliente
 * (`packages/core/lib/language-sync.ts`) con el idioma que la app enseña de
 * verdad («es» o «en»), al arrancar, al iniciar sesión y cada vez que el
 * usuario lo cambia; lo lee `mcp-server/src/api/push-sender.ts` para elegir la
 * variante de cada push.
 *
 * Texto y no `select`: añadir un idioma (pt-BR, #819) no debe exigir otra
 * migración de esquema. El cliente ya normaliza a un idioma soportado y el
 * servidor trata cualquier otro valor como «es».
 *
 * Vacío = «es» EN EL USO, no en el campo: no hay backfill. Las cuentas
 * existentes se rellenan solas al abrir una versión de la app que sincroniza, y
 * mientras tanto siguen recibiendo el español que ya recibían.
 *
 * Privado sin tocar nada más: `users_field_privacy.pb.js` es una lista blanca y
 * un campo nuevo nace oculto para terceros; el superusuario del AI API lo lee.
 *
 * IDEMPOTENTE: si el campo ya existe no se guarda nada. El `id` es FIJO
 * (feedback_migration_safety).
 */

const FIELD_ID = "text_users_language"

migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")
  if (users.fields.find(f => f.name === "language")) return
  users.fields.add(new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": FIELD_ID,
    "max": 10,
    "min": 0,
    "name": "language",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))
  app.save(users)
  console.log("[users_language] campo language añadido")
}, (app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")
  users.fields.removeById(FIELD_ID)
  app.save(users)
})
