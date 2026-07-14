/// <reference path="../pb_data/types.d.ts" />

/**
 * Efectos del bloqueo — TRANSACCIONALES (spec 2026-07-14).
 * En onRecordCreate/onRecordDelete, el código tras e.next() corre dentro de la
 * transacción de guardado usando e.app. Un throw revierte TODO (incluido el
 * record de user_blocks): o el bloqueo queda completo o no queda nada.
 * NUNCA usar $app aquí — escaparía de la transacción.
 */

onRecordCreate(function (e) {
  e.next()

  var txApp = e.app
  var blocker = e.record.getString("blocker")
  var blocked = e.record.getString("blocked")

  // 1. Unfollow mutuo
  var follows = txApp.findRecordsByFilter(
    "follows",
    "(follower = '" + blocker + "' && following = '" + blocked + "') || (follower = '" + blocked + "' && following = '" + blocker + "')",
    "", 10, 0
  )
  for (var i = 0; i < follows.length; i++) {
    txApp.delete(follows[i])
  }

  // 2. Sincronizar campo espejo blocked_users del blocker (idempotente)
  var blockerRec = txApp.findRecordById("users", blocker)
  var list = blockerRec.getStringSlice("blocked_users")
  if (list.indexOf(blocked) === -1) {
    list.push(blocked)
    blockerRec.set("blocked_users", list)
    txApp.save(blockerRec)
  }

  // 3. Borrar notificaciones existentes entre el par (ambas direcciones)
  var notifs = txApp.findRecordsByFilter(
    "notifications",
    "(user = '" + blocker + "' && actor = '" + blocked + "') || (user = '" + blocked + "' && actor = '" + blocker + "')",
    "", 500, 0
  )
  for (var j = 0; j < notifs.length; j++) {
    txApp.delete(notifs[j])
  }
}, "user_blocks")

onRecordDelete(function (e) {
  e.next()

  var txApp = e.app
  var blocker = e.record.getString("blocker")
  var blocked = e.record.getString("blocked")

  // Quitar del campo espejo. Si el user ya no existe (cascade delete de
  // cuenta), no hay nada que limpiar.
  try {
    var blockerRec = txApp.findRecordById("users", blocker)
    var list = blockerRec.getStringSlice("blocked_users")
    var idx = list.indexOf(blocked)
    if (idx !== -1) {
      list.splice(idx, 1)
      blockerRec.set("blocked_users", list)
      txApp.save(blockerRec)
    }
  } catch (err) { /* usuario borrado — no-op */ }
}, "user_blocks")
