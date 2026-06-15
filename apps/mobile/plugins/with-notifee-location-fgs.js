/**
 * El service de notifee (app.notifee.core.ForegroundService) es ÚNICO y
 * compartido por todas las notificaciones FGS (entreno y cardio). Declaramos
 * en el manifest el SUPERCONJUNTO de tipos que usamos en runtime:
 *   - "dataSync"  → notificación del entreno (live-session). No exige permisos
 *                   de runtime y no tiene el límite de ~3 min de "shortService".
 *   - "location"  → notificación de cardio (GPS en background; Android 14+ lo exige).
 * Cada notificación elige su tipo concreto con `foregroundServiceTypes`
 * (ver live-session.ts y cardio-live.ts); ese tipo DEBE ser subconjunto de lo
 * declarado acá. Antes era "shortService|location": como live-session NO
 * especificaba tipo, notifee arrancaba el FGS con el superconjunto (incl.
 * location) y en targetSDK 36 eso crasheaba sin permiso de ubicación.
 */
const { withAndroidManifest } = require('expo/config-plugins')

const SERVICE_NAME = 'app.notifee.core.ForegroundService'

module.exports = function withNotifeeLocationFgs(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest
    manifest.$ = manifest.$ || {}
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools'

    const application = manifest.application?.[0]
    if (!application) return cfg
    application.service = application.service || []

    let service = application.service.find((s) => s.$?.['android:name'] === SERVICE_NAME)
    if (!service) {
      service = { $: { 'android:name': SERVICE_NAME, 'android:exported': 'false' } }
      application.service.push(service)
    }
    service.$['android:foregroundServiceType'] = 'dataSync|location'
    service.$['tools:replace'] = 'android:foregroundServiceType'
    return cfg
  })
}
