/**
 * El service de notifee (app.notifee.core.ForegroundService) es ÚNICO y
 * compartido por todas las notificaciones FGS. Hoy solo lo usa cardio:
 *   - "location"  → notificación de cardio (GPS en background; Android 14+ lo exige).
 * La notificación del entreno (live-session.ts) ya NO es foreground service:
 * fue "dataSync" hasta vc36 (Play lo rechazó en vc35) y "health" de vc37 a
 * vc41 (rechazado en los envíos 14 y 16: «Health Data Sync» no perceptible).
 * No vuelvas a añadir "health" sin leer antes
 * docs/health-connect-declaracion-play.md §9.
 * El tipo que pide cada notificación con `foregroundServiceTypes` (ver
 * cardio-live.ts) DEBE ser subconjunto de lo declarado acá: si una notificación
 * no especifica tipo, notifee arranca con el superconjunto del manifest.
 */
const { withAndroidManifest, withProjectBuildGradle } = require('expo/config-plugins')

const SERVICE_NAME = 'app.notifee.core.ForegroundService'

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
    service.$['android:foregroundServiceType'] = 'location'
    service.$['tools:replace'] = 'android:foregroundServiceType'
    return cfg
  })
}

module.exports = function withNotifeeLocationFgs(config) {
  return withNotifeeMavenRepo(withNotifeeFgsManifest(config))
}
