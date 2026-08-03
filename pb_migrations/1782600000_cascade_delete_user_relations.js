/// <reference path="../pb_data/types.d.ts" />
/**
 * Requisito previo del borrado de cuenta autoservicio (issue #300).
 *
 * PocketBase, al borrar un registro, recorre las relaciones que lo apuntan: si
 * el campo tiene `cascadeDelete` borra la fila referenciante; si no, intenta
 * dejar la relación vacía. Cuando el campo además es `required`, esa segunda
 * rama no puede guardar y **el borrado entero falla**:
 *
 *   DELETE /api/collections/users/records/{id}
 *   -> 400 "Failed to delete record. Make sure that the record is not part of
 *           a required relation reference."
 *
 * Comprobado contra PocketBase 0.36.8 con una copia de la base real: bastaba
 * una sesión de cardio para que el borrado de la propia cuenta devolviera 400.
 * Es decir: sin esta migración el botón de #300 no puede funcionar para nadie
 * que haya grabado cardio, circuitos, carreras o invitado a alguien.
 *
 * De las 60 relaciones que apuntan a `users`, 52 ya cascadeaban. Estas 7 se
 * quedaron atrás (todas `required`, todas bloqueantes):
 *
 * - `cardio_sessions.user` (1774000029:12) y `race_participants.user`
 *   (1775200002:15) — las dos que la política de privacidad publicada declara
 *   hoy como "no se borran solas" (§6). Son también la segunda mitad de #299.
 * - `circuit_sessions.user` (1775100010) — mismo agujero, no detectado en #295.
 * - `races.creator` (1775200001) — al borrar la carrera cascadean sus
 *   `race_participants` (esa relación sí tiene cascadeDelete), así que no
 *   quedan participaciones colgando de una carrera inexistente.
 * - `referrals.referrer` y `referrals.referred` (1774000049) — el registro de
 *   una invitación no sobrevive a ninguna de las dos partes.
 * - `content_reports.target_user` (1782000000) — las denuncias sobre una cuenta
 *   borrada dejan de tener objeto; las que esa cuenta emitió (`reporter`) ya
 *   cascadeaban.
 *
 * Quedan a propósito fuera `programs.created_by` y `exercises_catalog.created_by`:
 * son opcionales, así que PocketBase se limita a vaciarlas, y el contenido
 * compartido debe sobrevivir a la baja de quien lo creó.
 *
 * Solo se cambia la bandera sobre el objeto de campo ya existente: se conserva
 * `field.id` y con él los datos (ver la nota de seguridad de migraciones).
 * Idempotente: reaplicarla no hace nada.
 */
const RELATIONS = [
  ["cardio_sessions", "user"],
  ["circuit_sessions", "user"],
  ["race_participants", "user"],
  ["races", "creator"],
  ["referrals", "referrer"],
  ["referrals", "referred"],
  ["content_reports", "target_user"],
]

function setCascade(app, value) {
  for (const [collectionName, fieldName] of RELATIONS) {
    let collection
    try {
      collection = app.findCollectionByNameOrId(collectionName)
    } catch (err) {
      continue // colección aún no creada en este entorno
    }
    // `fields.getByName` devuelve el campo por referencia; `fields.find(...)`
    // devuelve una copia y mutarla no llega a guardarse (falla en silencio).
    const field = collection.fields.getByName(fieldName)
    if (!field) continue
    field.cascadeDelete = value
    app.save(collection)
  }
}

migrate((app) => {
  setCascade(app, true)
}, (app) => {
  // Rollback simétrico: vuelve a dejar el borrado de cuenta bloqueado.
  setCascade(app, false)
})
