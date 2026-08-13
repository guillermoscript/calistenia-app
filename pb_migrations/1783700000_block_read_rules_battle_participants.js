/// <reference path="../pb_data/types.d.ts" />

/**
 * Último hueco del enforcement de bloqueo en lectura (#413, refs #386).
 *
 * `battle_participants` se creó en `1782800000_created_battles.js` mientras el stack
 * de batallas (#385-#406) estaba en vuelo, así que no pasó por las migraciones de
 * bloqueo (`1783400000` / `1783400001` / `1783400002`). Su regla era:
 *
 *   user = @request.auth.id || battle.creator = @request.auth.id
 *
 * La segunda rama es la fuga: el creador lee TODAS las filas de su batalla, incluida
 * la de alguien con quien hay bloqueo, y esa fila lleva `progress` y `last_seen_at`
 * (progreso en vivo). Bloqueas a alguien, desaparece de su perfil, su muro, sus
 * entrenos y su posición en carreras desde #410 — pero seguía apareciendo en directo
 * aquí.
 *
 * La primera rama se queda SIN cláusula de bloqueo a propósito: la fila propia se ve
 * siempre, igual que en `users` (#411) el usuario nunca se recorta a sí mismo.
 *
 * `!=` sobre una multi-relación es all-match ("no contiene") y la lista vacía pasa,
 * así que quien no tiene bloqueos no nota ningún cambio.
 *
 * Esta regla NO es la superficie por la que un participante no creador ve el marcador:
 * eso lo sirve `GET /api/battles/{id}/snapshot`, que corre con `$app` y se salta las
 * API rules. La suscripción realtime a `battle_participants` de
 * `packages/core/lib/battleRealtime.ts` solo se usa como señal para refrescar, y cada
 * `POST /progress` hace `bumpRevision` del `battles`, así que el refetch sigue
 * llegando por la suscripción a `battles`. Por eso endurecer esta regla no le quita
 * ningún dato a la UI de una batalla en marcha, que es lo que decide #413: se bloquea
 * la ENTRADA (ver el guard en `pb_hooks/utils/battles.js`), no una batalla ya empezada.
 *
 * Solo se tocan reglas: no se modifica ningún campo, se preservan los field.id.
 */

const PREVIOUS_RULE = 'user = @request.auth.id || battle.creator = @request.auth.id'

const RULE = 'user = @request.auth.id || (battle.creator = @request.auth.id && ' +
  'user.blocked_users.id != @request.auth.id && ' +
  '@request.auth.blocked_users.id != user.id)'

migrate((app) => {
  const participants = app.findCollectionByNameOrId('battle_participants')
  participants.listRule = RULE
  participants.viewRule = RULE
  app.save(participants)
}, (app) => {
  try {
    const participants = app.findCollectionByNameOrId('battle_participants')
    participants.listRule = PREVIOUS_RULE
    participants.viewRule = PREVIOUS_RULE
    app.save(participants)
  } catch (e) {}
})
