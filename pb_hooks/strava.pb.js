/// <reference path="../pb_data/types.d.ts" />

/**
 * Integración con Strava (#914): conectar cuenta y subir sesiones de cardio.
 * La lógica vive en `utils/strava.js`; aquí solo los registros (cada callback
 * corre en un JSVM aislado y no ve nada de este fichero).
 *
 * Variables de entorno: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET,
 * STRAVA_STATE_SECRET (cadena aleatoria larga), STRAVA_REDIRECT_URI (la URL
 * pública de /api/strava/callback) y, opcional, STRAVA_WEB_URL (origen de la
 * web si no es el mismo que el de PocketBase, p. ej. Vite en desarrollo).
 */

routerAdd("GET", "/api/strava/status", function (e) {
  return require(`${__hooks}/utils/strava.js`).handlers.status(e)
}, $apis.requireAuth())

routerAdd("POST", "/api/strava/connect", function (e) {
  return require(`${__hooks}/utils/strava.js`).handlers.connect(e)
}, $apis.requireAuth())

// Sin auth a propósito: Strava redirige aquí desde el navegador, sin token de
// PocketBase. La cuenta se identifica por el `state` firmado de /connect.
routerAdd("GET", "/api/strava/callback", function (e) {
  return require(`${__hooks}/utils/strava.js`).handlers.callback(e)
})

routerAdd("POST", "/api/strava/disconnect", function (e) {
  return require(`${__hooks}/utils/strava.js`).handlers.disconnect(e)
}, $apis.requireAuth())

routerAdd("POST", "/api/strava/upload", function (e) {
  return require(`${__hooks}/utils/strava.js`).handlers.upload(e)
}, $apis.requireAuth())
