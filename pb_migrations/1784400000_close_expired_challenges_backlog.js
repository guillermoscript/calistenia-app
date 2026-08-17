/// <reference path="../pb_data/types.d.ts" />

/**
 * Limpieza EN SILENCIO del backlog de retos caducados (#515).
 *
 * Hasta ahora el cierre lo hacía el navegador del creador, así que todo reto cuyo
 * creador no volvió a abrir la app sigue en `status = 'active'` con su `ends_at`
 * pasado hace meses. `pb_hooks/challenges_expiry.pb.js` los barre a partir de
 * ahora — pero encenderlo sin más sería una tormenta de notificaciones:
 * `pb_hooks/notification_service.pb.js` engancha `onRecordAfterUpdateSuccess`
 * sobre `challenges` y, en cuanto una fila pasa a `ended`, crea notificación y
 * manda push a TODOS los participantes. En su primera pasada el cron dispararía
 * una por cada reto del backlog.
 *
 * Por eso esto es SQL crudo y no `app.save(record)`: al no pasar por la capa de
 * registros no hay hook que dispare, ni notificación, ni push, ni siquiera
 * `updated` tocado. Es todo el motivo de que la migración exista; si alguien la
 * reescribe con `findRecordsByFilter` + `app.save`, vuelve la tormenta.
 */
migrate((app) => {
  // Copia exacta del corte del cron en `pb_hooks/challenges_expiry.pb.js` — si
  // cambia uno, cambia el otro. `ends_at` es un `text` YYYY-MM-DD sin zona
  // horaria, así que el corte se pone donde el día ya terminó en TODO el planeta
  // (12 h de margen), no donde terminó en UTC.
  //
  // Y es el mismo corte a propósito, ni un día más: estirarlo cerraría también
  // retos que todavía están en marcha hoy en alguna zona horaria. Lo que quede
  // entre esta migración y la primera pasada del cron —como mucho un día de
  // `ends_at`, si las 12:00 UTC caen en medio— son retos que acaban de caducar de
  // verdad, y notificar ESO es el comportamiento correcto, no la avalancha que
  // este fichero evita.
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const pending = arrayOf(new DynamicModel({ n: 0 }))
  app.db()
    .newQuery(`SELECT COUNT(*) AS n FROM challenges WHERE status = 'active' AND ends_at < {:cutoff}`)
    .bind({ cutoff: cutoff })
    .all(pending)

  const total = pending.length > 0 ? pending[0].n : 0
  if (!total) {
    console.log("[close_expired_challenges_backlog] nothing to close (cutoff " + cutoff + ")")
    return
  }

  app.db()
    .newQuery(`UPDATE challenges SET status = 'ended' WHERE status = 'active' AND ends_at < {:cutoff}`)
    .bind({ cutoff: cutoff })
    .execute()

  console.log("[close_expired_challenges_backlog] closed " + total + " expired challenges silently (cutoff " + cutoff + ")")
}, (app) => {
  // Sin vuelta atrás: un `status` de `ended` a `active` no distingue los retos que
  // esta migración cerró de los que ya estaban cerrados de antes, y revivirlos
  // dispararía la misma tormenta al volver a cerrarlos. Deshacerlo a mano si
  // alguna vez hace falta.
  console.log("[close_expired_challenges_backlog] down migration is a no-op on purpose — see the note in this file")
})
