/**
 * Firma de release con la upload key registrada en Google Play.
 *
 * `android/` está gitignorado (CNG): cada `expo prebuild` regenera
 * `app/build.gradle` con `release { signingConfig signingConfigs.debug }`, y el
 * AAB sale firmado como «CN=Android Debug» → `build:aab` lo rechaza y Play
 * también. Antes se re-editaba a mano tras cada prebuild; este plugin lo
 * inyecta siempre.
 *
 * Las credenciales NO viven en el repo: se leen de las propiedades gradle
 * `CALISTENIA_UPLOAD_STORE_FILE / _STORE_PASSWORD / _KEY_ALIAS / _KEY_PASSWORD`
 * (en `~/.gradle/gradle.properties` del PC de Guillermo; el keystore está en
 * `~/keystores/calistenia-upload.jks`). Si no están definidas (CI, otro PC,
 * builds de desarrollo) se cae a la debug keystore, igual que hacía la
 * plantilla, así que ningún build deja de compilar.
 */
const { withAppBuildGradle } = require('expo/config-plugins')

const MARKER = '// calistenia upload signing (plugins/with-upload-signing.js)'
const PROP = 'CALISTENIA_UPLOAD_STORE_FILE'

const RELEASE_SIGNING_CONFIG = `
        ${MARKER}
        release {
            if (project.hasProperty('${PROP}')) {
                storeFile file(project.property('${PROP}'))
                storePassword project.property('CALISTENIA_UPLOAD_STORE_PASSWORD')
                keyAlias project.property('CALISTENIA_UPLOAD_KEY_ALIAS')
                keyPassword project.property('CALISTENIA_UPLOAD_KEY_PASSWORD')
            }
        }`

const RELEASE_BUILD_TYPE_LINE =
  `signingConfig project.hasProperty('${PROP}') ? signingConfigs.release : signingConfigs.debug ${MARKER}`

function withUploadSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('with-upload-signing: solo soporta app/build.gradle en groovy')
    }
    let contents = cfg.modResults.contents
    if (contents.includes(MARKER)) return cfg

    // 1. signingConfigs { debug {...} } → añadir release {...} tras el bloque debug.
    const signingBlock = /signingConfigs\s*\{\s*debug\s*\{[^}]*\}/
    if (!signingBlock.test(contents)) {
      throw new Error('with-upload-signing: no encuentro signingConfigs.debug en app/build.gradle')
    }
    contents = contents.replace(signingBlock, (m) => m + RELEASE_SIGNING_CONFIG)

    // 2. buildTypes.release: sustituir SOLO la línea de firma del bloque release
    //    (la de debug se queda igual). Localizamos el bloque `release {` de
    //    buildTypes y reemplazamos su primer `signingConfig signingConfigs.debug`.
    const releaseIdx = contents.indexOf('release {', contents.indexOf('buildTypes {'))
    if (releaseIdx === -1) {
      throw new Error('with-upload-signing: no encuentro buildTypes.release en app/build.gradle')
    }
    const head = contents.slice(0, releaseIdx)
    const tail = contents.slice(releaseIdx)
    const replaced = tail.replace('signingConfig signingConfigs.debug', RELEASE_BUILD_TYPE_LINE)
    if (replaced === tail) {
      throw new Error('with-upload-signing: buildTypes.release no usa signingConfigs.debug; revisa la plantilla')
    }
    cfg.modResults.contents = head + replaced
    return cfg
  })
}

module.exports = withUploadSigning
