/**
 * El service de notifee (app.notifee.core.ForegroundService) es ÚNICO y
 * compartido por todas las notificaciones FGS. Declaramos en el manifest el
 * SUPERCONJUNTO de tipos que usamos en runtime:
 *   - "specialUse" → notificación del entreno en curso (live-session.ts): mantiene
 *                    vivo el proceso para que el cronómetro y los avisos sonoros
 *                    (fin de descanso, ejercicio por tiempo) sigan con la pantalla
 *                    apagada. Es el tipo que usan las apps de entreno publicadas
 *                    (p. ej. Calisteniapp declara exactamente este servicio y
 *                    esta propiedad, verificado en su APK el 2026-09-17). Exige
 *                    FOREGROUND_SERVICE_SPECIAL_USE (app.json) y la <property>
 *                    PROPERTY_SPECIAL_USE_FGS_SUBTYPE con la justificación, que
 *                    es lo que Play lee en el formulario de FGS.
 *   - "location"   → notificación de cardio (GPS en background; Android 14+ lo exige).
 *
 * Historia: el entreno fue "dataSync" hasta vc36 (Play lo rechazó en vc35),
 * "health" de vc37 a vc41 (rechazado en los envíos 14 y 16: «Health Data Sync»
 * no perceptible) y SIN foreground service en vc42 (#775), que dejó el fin del
 * descanso mudo con la pantalla apagada. No vuelvas a "health" ni "dataSync"
 * sin leer antes docs/health-connect-declaracion-play.md §9 y §10.
 *
 * El tipo que pide cada notificación con `foregroundServiceTypes` (ver
 * live-session.ts y cardio-live.ts) DEBE ser subconjunto de lo declarado acá: si
 * una notificación no especifica tipo, notifee arranca con el superconjunto del
 * manifest, y con location sin permiso de ubicación eso crashea en targetSDK 36.
 */
const { withAndroidManifest, withProjectBuildGradle } = require('expo/config-plugins')

const SERVICE_NAME = 'app.notifee.core.ForegroundService'
const SPECIAL_USE_PROPERTY = 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE'
/** Justificación que lee Play. En inglés a propósito: es para el revisor. */
const SPECIAL_USE_SUBTYPE =
  'Keeps the workout session alive while the user trains with the screen off: ' +
  'shows a persistent notification with the current exercise, set and rest countdown, ' +
  'and plays the audio cue when a rest or timed exercise ends. Started and stopped by the user.'

// Marca para no duplicar la inyección del repo maven de notifee.
const NOTIFEE_MAVEN_MARKER = '// notifee local AAR repo (pnpm-safe)'

/**
 * Inyecta el repositorio maven local de notifee (su AAR `app.notifee:core`
 * vive en node_modules/@notifee/react-native/android/libs) en el build.gradle
 * RAÍZ. notifee ya lo declara en su propio módulo vía `rootProject.allprojects`,
 * pero con `--configure-on-demand` (que usa `expo run:android`) ese módulo puede
 * configurarse DESPUÉS de que `:app` resuelva dependencias → "Could not find
 * app.notifee:core:+". Declararlo en la raíz garantiza que esté disponible.
 * Resolvemos la ruta con node (compatible con el layout symlinked de pnpm).
 */
function withNotifeeMavenRepo(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg
    if (cfg.modResults.contents.includes(NOTIFEE_MAVEN_MARKER)) return cfg
    cfg.modResults.contents += `
allprojects {
    repositories {
        maven {
            ${NOTIFEE_MAVEN_MARKER}
            url "\${new File(["node", "--print", "require.resolve('@notifee/react-native/package.json')"].execute(null, rootDir).text.trim()).parentFile}/android/libs"
        }
    }
}
`
    return cfg
  })
}

function withNotifeeFgsManifest(config) {
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
    service.$['android:foregroundServiceType'] = 'specialUse|location'
    service.$['tools:replace'] = 'android:foregroundServiceType'
    // Android 14+ exige esta propiedad en todo service con specialUse; Play la
    // muestra en la declaración de FGS. El texto es la justificación.
    service.property = (service.property || []).filter(
      (p) => p.$?.['android:name'] !== SPECIAL_USE_PROPERTY,
    )
    service.property.push({
      $: { 'android:name': SPECIAL_USE_PROPERTY, 'android:value': SPECIAL_USE_SUBTYPE },
    })
    return cfg
  })
}

module.exports = function withNotifeeLocationFgs(config) {
  return withNotifeeMavenRepo(withNotifeeFgsManifest(config))
}
