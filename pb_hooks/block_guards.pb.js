/// <reference path="../pb_data/types.d.ts" />

/**
 * Rechaza escrituras cruzadas entre usuarios con bloqueo (spec 2026-07-14).
 * Corren ANTES de e.next() → throw aborta la creación (400).
 * Mensaje genérico: no revelar que existe un bloqueo.
 */

// Comentar contenido de alguien con quien hay bloqueo
onRecordCreate(function (e) {
  var blocks = require(`${__hooks}/utils/blocks.js`)
  var author = e.record.getString("author")
  var owner = blocks.findSessionOwner(e.app, e.record.getString("session_id"))
  if (owner && blocks.isBlocked(e.app, author, owner)) {
    throw new BadRequestError("No se pudo completar la acción")
  }
  e.next()
}, "comments")

// Reaccionar a una sesión
onRecordCreate(function (e) {
  var blocks = require(`${__hooks}/utils/blocks.js`)
  var reactor = e.record.getString("reactor")
  var owner = blocks.findSessionOwner(e.app, e.record.getString("session_id"))
  if (owner && blocks.isBlocked(e.app, reactor, owner)) {
    throw new BadRequestError("No se pudo completar la acción")
  }
  e.next()
}, "feed_reactions")

// Reaccionar a un comentario
onRecordCreate(function (e) {
  var blocks = require(`${__hooks}/utils/blocks.js`)
  var reactor = e.record.getString("reactor")
  var owner = ""
  try {
    var comment = e.app.findRecordById("comments", e.record.getString("comment_id"))
    owner = comment.getString("author")
  } catch (err) { /* comentario inexistente — dejar que siga su curso normal */ }
  if (owner && blocks.isBlocked(e.app, reactor, owner)) {
    throw new BadRequestError("No se pudo completar la acción")
  }
  e.next()
}, "comment_reactions")

// Re-seguir a alguien con quien hay bloqueo
onRecordCreate(function (e) {
  var blocks = require(`${__hooks}/utils/blocks.js`)
  var follower = e.record.getString("follower")
  var following = e.record.getString("following")
  if (blocks.isBlocked(e.app, follower, following)) {
    throw new BadRequestError("No se pudo completar la acción")
  }
  e.next()
}, "follows")

// Unirse a un reto cuyo creador tiene bloqueo con el participante
onRecordCreate(function (e) {
  var blocks = require(`${__hooks}/utils/blocks.js`)
  var participant = e.record.getString("user")
  var creator = ""
  try {
    var challenge = e.app.findRecordById("challenges", e.record.getString("challenge"))
    creator = challenge.getString("creator")
  } catch (err) { /* reto inexistente */ }
  if (creator && blocks.isBlocked(e.app, participant, creator)) {
    throw new BadRequestError("No se pudo completar la acción")
  }
  e.next()
}, "challenge_participants")
