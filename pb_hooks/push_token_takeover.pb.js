/// <reference path="../pb_data/types.d.ts" />

/**
 * Reasignación del token de push cuando un dispositivo cambia de cuenta.
 *
 * `expo_push_tokens.token` tiene índice único y la colección es owner-only en
 * `listRule`/`viewRule`/`updateRule` (`1776700000_created_expo_push_tokens.js`).
 * Esas dos cosas juntas dejaban al cliente sin salida: `push-registration.ts`
 * intenta un upsert buscando primero el token con `getFirstListItem`, pero si el
 * registro pertenece a OTRA cuenta —el único caso en que hay algo que reasignar—
 * la regla lo esconde y la búsqueda devuelve 0 filas SIN error. El cliente cae
 * entonces a `create` y se come un 400 `validation_not_unique`, y como el
 * registro es fire-and-forget el fallo solo queda en un `console.warn`.
 *
 * Consecuencia en producción: un móvil que cambia de usuario seguía mandando los
 * push al dueño anterior y el nuevo no recibía ninguno, en silencio. Se vio al
 * instalar el vc30 en un dispositivo cuyo token estaba registrado a otra cuenta.
 *
 * El arreglo va en el servidor a propósito: así también quedan arregladas las
 * versiones de la app ya publicadas, que no se pueden actualizar. El cliente no
 * necesita ningún cambio — su `create` es justamente la señal de "este
 * dispositivo es mío ahora".
 *
 * Nota de seguridad: quien posea un token de dispositivo ajeno puede quedárselo
 * y pasar a recibir sus push. No hay forma de demostrar la posesión del
 * dispositivo desde el servidor, y la alternativa es dejar el push roto para
 * siempre en cuanto alguien comparte o revende un móvil. El token solo lo puede
 * obtener quien tiene acceso al dispositivo.
 */

console.log("[push_token_takeover] hook file loaded")

onRecordCreateRequest(function (e) {
  // e.next() al principio pasaría el turno antes de borrar el registro viejo y
  // el create moriría con el 400 de siempre; aquí el trabajo va antes y hay un
  // único camino de salida, así que la cadena de hooks nunca se queda colgada.
  var token = e.record.getString("token")
  if (token) {
    var previous = null
    try {
      previous = e.app.findFirstRecordByFilter(
        "expo_push_tokens",
        "token = {:token}",
        { token: token },
      )
    } catch (err) {
      // findFirstRecordByFilter lanza cuando no hay coincidencias: es el curso
      // normal (token nuevo) y no hay nada que reasignar.
    }
    if (previous) {
      // Se borra en vez de actualizarse para que el create siga su curso y el
      // cliente reciba exactamente la misma respuesta que en un alta normal.
      // El id cambia, pero a estos registros no apunta nada: el emisor de push
      // los busca por `user` (`mcp-server/src/api/push-sender.ts`).
      e.app.delete(previous)
      console.log(
        "[push_token_takeover] token reasignado; borrado el registro previo " +
          previous.getString("id"),
      )
    }
  }
  e.next()
}, "expo_push_tokens")
