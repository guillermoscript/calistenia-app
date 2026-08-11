/// <reference path="../pb_data/types.d.ts" />

/**
 * Bloquea el auto-referido en el servidor (issue #354).
 *
 * Hasta ahora la createRule solo comprobaba `referred = @request.auth.id`, así
 * que nada impedía crear una fila con el mismo usuario como `referrer` y como
 * `referred`: el índice único es sobre el PAR, y un par (X, X) es único. El
 * bloqueo vivía solo en el cliente (`useReferrals.trackReferral` y
 * `useAuth.completeNewUserRegistration`), esquivable llamando a la API directamente.
 *
 * Regalarse a uno mismo los 100 + 50 puntos que acredita
 * `pb_hooks/referral_side_effects.pb.js` es exactamente lo que esto corta.
 *
 * Solo cambia reglas de API: no toca campos, así que no hay riesgo de perder
 * datos por `field.id` (ver nota de seguridad de migraciones).
 */
migrate((app) => {
  const referrals = app.findCollectionByNameOrId("referrals")
  referrals.createRule = '@request.auth.id != "" && @request.body.referred = @request.auth.id && @request.body.referrer != @request.auth.id'
  app.save(referrals)
}, (app) => {
  const referrals = app.findCollectionByNameOrId("referrals")
  referrals.createRule = '@request.auth.id != "" && @request.body.referred = @request.auth.id'
  app.save(referrals)
})
