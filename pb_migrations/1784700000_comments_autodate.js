/// <reference path="../pb_data/types.d.ts" />

/**
 * `comments.created` / `comments.updated` (autodate).
 *
 * En PocketBase ≥ 0.23 las marcas de tiempo NO son automáticas: una colección
 * creada con `new Collection({ fields: [...] })` nace sin `created` ni
 * `updated` salvo que se declaren como campos `autodate`. La migración
 * `1774000046_created_comments.js` no lo hizo, así que ningún comentario tiene
 * fecha. `useComments.ts` tapaba el agujero con `new Date()` y el resultado era
 * que TODOS los comentarios, viejos o nuevos, salían como «hace unos segundos»
 * en el sheet de comentarios (web y móvil).
 *
 * Esta migración añade los dos campos y rellena `created` en los comentarios
 * que ya existen a partir de `notifications` (que sí tiene autodate):
 *
 *  1. Por `data.commentId` exacto — las notificaciones creadas desde que el
 *     deep-link resalta el comentario llevan su id.
 *  2. Las anteriores no lo llevan: se casan por sesión + autor + `preview`
 *     (el texto entero o sus 60 primeros caracteres + «...», que es como lo
 *     recorta `notification_service.pb.js`).
 *
 * El comentario que no generó notificación (p. ej. el dueño comentando su
 * propia sesión) se queda sin fecha y el cliente no pinta nada, que es mejor
 * que inventar una.
 *
 * Solo se añaden campos: ningún `field.id` existente se toca.
 */
migrate((app) => {
  const comments = app.findCollectionByNameOrId("comments")
  let changed = false

  if (!comments.fields.find((f) => f.name === "created")) {
    comments.fields.add(new Field({
      name: "created",
      type: "autodate",
      onCreate: true,
      onUpdate: false,
    }))
    changed = true
  }
  if (!comments.fields.find((f) => f.name === "updated")) {
    comments.fields.add(new Field({
      name: "updated",
      type: "autodate",
      onCreate: true,
      onUpdate: true,
    }))
    changed = true
  }
  if (changed) app.save(comments)

  // Backfill de `created` desde la notificación que generó cada comentario.
  app.db()
    .newQuery(`
      UPDATE comments SET created = COALESCE(
        (
          SELECT n.created FROM notifications n
          WHERE json_extract(n.data, '$.commentId') = comments.id
          ORDER BY n.created LIMIT 1
        ),
        (
          SELECT n.created FROM notifications n
          WHERE n.type IN ('comment', 'comment_reply')
            AND n.reference_id = comments.session_id
            AND n.actor = comments.author
            AND json_extract(n.data, '$.preview') IN (comments.text, substr(comments.text, 1, 60) || '...')
          ORDER BY n.created LIMIT 1
        ),
        ''
      )
      WHERE created IS NULL OR created = ''
    `)
    .execute()

  app.db()
    .newQuery("UPDATE comments SET updated = created WHERE (updated IS NULL OR updated = '') AND created != ''")
    .execute()
}, (app) => {
  const comments = app.findCollectionByNameOrId("comments")
  comments.fields.removeByName("created")
  comments.fields.removeByName("updated")
  app.save(comments)
})
