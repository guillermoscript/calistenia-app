/// <reference path="../pb_data/types.d.ts" />

/**
 * Enforcement de bloqueo en la colección `users` (#386).
 *
 * `1778000002_block_read_rules.js` dejó `users` fuera a propósito, con la nota
 * de que tocarla "rompería expands de author/actor". Al revisarlo con la suite
 * de integración delante, el razonamiento ya no se sostiene: el resto de
 * colecciones sociales YA esconden las filas del par bloqueado, así que el
 * expand de un usuario bloqueado no llega a intentarse desde ninguna vista
 * legítima. Y sin esta regla el bloqueo queda a medias — la persona bloqueada
 * seguía pudiendo leer el perfil (display_name, avatar, nivel, objetivo…) de
 * quien la bloqueó, y encontrarla en el buscador de amigos.
 *
 * La regla mantiene dos garantías imprescindibles:
 *  - `id = @request.auth.id` va primero: cada usuario SIEMPRE puede leer su
 *    propia fila, incluso si algo raro pasara con el espejo `blocked_users`.
 *    Sin esto se rompería el arranque de sesión de la app.
 *  - Las dos cláusulas de bloqueo son las mismas que en el resto de
 *    colecciones, así que el comportamiento es simétrico: ninguno de los dos
 *    ve al otro.
 *
 * Multi-relación con != = all-match ("no contiene"); lista vacía pasa.
 *
 * Solo se tocan reglas: no se modifica ningún campo, se preservan los field.id.
 */
const PREV_RULE = '@request.auth.id != ""'

const RULE = '@request.auth.id != "" && (' +
  'id = @request.auth.id || (' +
  'blocked_users.id != @request.auth.id && ' +
  '@request.auth.blocked_users.id != id' +
  '))'

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.listRule = RULE
  users.viewRule = RULE
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.listRule = PREV_RULE
  users.viewRule = PREV_RULE
  app.save(users)
})
