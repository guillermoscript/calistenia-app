/**
 * Setup nativo de react-native-health-connect que ni la lib ni su config plugin
 * (app.plugin.js, que solo añade el action de rationale viejo) resuelven:
 *
 * 1) PERMISSION DELEGATE — registrar en MainActivity.onCreate:
 *      HealthConnectPermissionDelegate.setPermissionDelegate(this)
 *    Sin esto, su `lateinit var requestPermission` (ActivityResultLauncher) nunca
 *    se inicializa y requestPermission() crashea con:
 *      kotlin.UninitializedPropertyAccessException: lateinit property
 *      requestPermission has not been initialized
 *    registerForActivityResult() debe llamarse antes de que la Activity llegue a
 *    STARTED → va justo tras super.onCreate(...).
 *
 * 2) RATIONALE INTENT (Android 14+) — en Android 14+ Health Connect vive en el
 *    SO. Antes de mostrar el diálogo de permisos, el controlador de HC verifica
 *    que la app declare un handler del intent de "ver uso de permisos"; si no, lo
 *    rechaza al instante con:
 *      E PermissionsActivity: App should support rationale intent, finishing!
 *    (el diálogo aparece y se cierra solo en ~200ms). El sample oficial de Google
 *    lo resuelve con un intent-filter DIRECTO en MainActivity (sin activity-alias
 *    ni permiso especial):
 *      <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
 *      <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
 *    El action viejo `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`
 *    (Android 13-) ya lo añade el plugin de la lib.
 *
 * MainActivity.kt y AndroidManifest.xml los regenera `expo prebuild`, así que no
 * se pueden editar a mano de forma durable. Este plugin inyecta ambas cosas
 * (idempotente).
 */
const { withMainActivity, withAndroidManifest } = require('expo/config-plugins')

const IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate'
const CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)'

const VIEW_PERMISSION_USAGE = 'android.intent.action.VIEW_PERMISSION_USAGE'
const HEALTH_PERMISSIONS_CATEGORY = 'android.intent.category.HEALTH_PERMISSIONS'

function withPermissionDelegate(config) {
  return withMainActivity(config, (cfg) => {
    const { language } = cfg.modResults
    if (language !== 'kt') {
      throw new Error(
        `[with-health-connect-permission-delegate] MainActivity esperado en Kotlin, encontrado: ${language}`,
      )
    }
    let contents = cfg.modResults.contents

    if (!contents.includes(IMPORT)) {
      contents = contents.replace(/(^package .*$)/m, `$1\n\n${IMPORT}`)
    }
    if (!contents.includes(CALL)) {
      contents = contents.replace(
        /(super\.onCreate\([^)]*\))/,
        `$1\n    // react-native-health-connect: registra el ActivityResult launcher de permisos\n    ${CALL}`,
      )
    }

    cfg.modResults.contents = contents
    return cfg
  })
}

function withRationaleIntentFilter(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0]
    if (!application?.activity) return cfg

    const mainActivity = application.activity.find(
      (a) => a.$?.['android:name'] === '.MainActivity',
    )
    if (!mainActivity) return cfg

    mainActivity['intent-filter'] = mainActivity['intent-filter'] || []

    const already = mainActivity['intent-filter'].some((f) =>
      (f.action || []).some((a) => a.$?.['android:name'] === VIEW_PERMISSION_USAGE),
    )
    if (already) return cfg

    mainActivity['intent-filter'].push({
      action: [{ $: { 'android:name': VIEW_PERMISSION_USAGE } }],
      category: [{ $: { 'android:name': HEALTH_PERMISSIONS_CATEGORY } }],
    })
    return cfg
  })
}

module.exports = function withHealthConnectPermissionDelegate(config) {
  return withRationaleIntentFilter(withPermissionDelegate(config))
}
