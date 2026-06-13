/**
 * El service de notifee (app.notifee.core.ForegroundService) declara
 * foregroundServiceType="shortService" por defecto. Para que la notificación
 * de cardio pueda ser un FGS de tipo location (Android 14+ lo exige para
 * recibir GPS en background), ampliamos el tipo a "shortService|location".
 * El flujo del entreno (live-session) sigue arrancando igual que siempre.
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
    service.$['android:foregroundServiceType'] = 'shortService|location'
    service.$['tools:replace'] = 'android:foregroundServiceType'
    return cfg
  })
}
