/// <reference path="../pb_data/types.d.ts" />

/**
 * Cierre de retos caducados (#515).
 *
 * Hasta ahora esto lo hacía el navegador del creador, desde un efecto de
 * `useChallenges`: si el creador no abría la app el reto se quedaba en `active`
 * para siempre, y cualquier participante que no fuese el creador se comía un 403
 * al intentarlo (el bucle infinito de #451). El servidor es ahora el único que
 * escribe `status = 'ended'`; el cliente solo clasifica en local para pintar.
 *
 * Ojo: `pb_hooks/notification_service.pb.js` engancha `onRecordAfterUpdateSuccess`
 * sobre `challenges` y manda notificación + push a todos los participantes en
 * cuanto una fila pasa a `ended`. Eso es deseable para los retos que caducan de
 * aquí en adelante, y es exactamente lo que el backlog histórico NO debe
 * disparar: la migración `1784400000_close_expired_challenges_backlog.js` lo
 * limpia con SQL crudo, sin pasar por `app.save()`, antes de que este cron llegue
 * a verlo.
 */

console.log("[challenges_expiry] hook file loaded")

/**
 * Barrido horario. La granularidad de `ends_at` es de un día, así que barrer cada
 * cinco minutos como `battles_expiry` no compra nada.
 *
 * TODO lo que usa el callback vive DENTRO del callback, a propósito: el JSVM
 * ejecuta cada `cronAdd` en un runtime aislado que no ve el scope de este fichero.
 * Una constante declarada aquí arriba es `undefined` ahí dentro, el callback lanza
 * un ReferenceError, y un `cronAdd` que lanza muere EN SILENCIO — la pasada no
 * deja ni una línea de log y todo parece correcto. Por eso además el cuerpo entero
 * va envuelto en `try/catch` y cada pasada registra su recuento.
 */
cronAdd("challenges_expiry", "0 * * * *", function () {
  // Tope de lote para que una sola pasada no se atragante con un backlog grande.
  // Tocarlo se registra en vez de tragarse: la pasada sigue pareciendo correcta, y
  // sin la línea nadie sabría que el backlog solo drena de 200 en 200.
  var CHALLENGE_BATCH = 200

  // Fecha `YYYY-MM-DD` a partir de la cual un reto se considera caducado en TODAS
  // las zonas horarias del planeta.
  //
  // `ends_at` es un `text` YYYY-MM-DD sin zona: el cliente lo compara contra su
  // fecha LOCAL. Usar aquí la fecha UTC cerraría el reto del día D mientras un
  // usuario en UTC-12 sigue en la mañana de ese día. El día D ha terminado en todo
  // el mundo en el instante `D+1T12:00:00Z`, y restar 12 h a "ahora" antes de
  // quedarse con la fecha produce justo esa condición: el corte pasa a valer `D+1`
  // (y por tanto `ends_at = D` entra en `< corte`) exactamente a las 12:00 UTC del
  // día siguiente, ni un minuto antes.
  //
  // El precio es que la fila del servidor se actualiza hasta ~36 h después del
  // `ends_at`. Es inocuo: el usuario ve el reto como terminado al instante porque
  // `fetchChallenges` lo clasifica en local sin esperar al cron. La migración del
  // backlog lleva una copia de este cálculo — si cambia uno, cambia el otro.
  var cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString().slice(0, 10)

  var expired = []
  try {
    expired = $app.findRecordsByFilter(
      "challenges",
      "status = 'active' && ends_at < {:cutoff}",
      "",
      CHALLENGE_BATCH,
      0,
      { cutoff: cutoff },
    )
  } catch (err) {
    console.log("[challenges_expiry] lookup failed:", err)
    return
  }

  var closed = 0
  for (var i = 0; i < expired.length; i++) {
    try {
      expired[i].set("status", "ended")
      $app.save(expired[i])
      closed++
    } catch (err) {
      console.log("[challenges_expiry] could not close challenge:", err)
    }
  }

  console.log("[challenges_expiry] closed", closed, "of", expired.length, "expired challenges (cutoff", cutoff + ")")
  if (expired.length >= CHALLENGE_BATCH) {
    console.log("[challenges_expiry] hit the batch cap — more remain, next run in an hour")
  }
})
