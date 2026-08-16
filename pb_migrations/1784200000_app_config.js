/// <reference path="../pb_data/types.d.ts" />

/**
 * `app_config` — version gate + feature flags remotos (una fila por plataforma).
 *
 * POR QUÉ UNA COLECCIÓN Y NO CONSTANTES EN EL HOOK: el caso de uso es "hay un
 * problema AHORA y hay que cortar". Una colección se edita desde el admin de
 * PocketBase y surte efecto en la siguiente petición, sin build, sin deploy y
 * sin pasar por la revisión de Play.
 *
 * REGLAS: todas en null (bloqueada). El único acceso de lectura es
 * `pb_hooks/app_config.pb.js`, que corre con $app y devuelve un subconjunto
 * curado. Así se puede meter aquí cualquier cosa operativa en el futuro sin
 * exponerla por accidente.
 *
 * `min_supported_build` y `latest_build` NO son `required` a propósito: en
 * PocketBase un campo `number` con `required: true` RECHAZA el valor 0, y 0 es
 * justo el default que necesitamos (= gate desactivado).
 *
 * SEMILLA: se siembra con el gate DESACTIVADO (min = 0) en las tres
 * plataformas. Nadie queda bloqueado por desplegar esta migración.
 */
migrate((app) => {
  let cfg
  try {
    cfg = app.findCollectionByNameOrId('app_config')
  } catch {
    cfg = new Collection({
      name: 'app_config',
      type: 'base',
      fields: [
        // 'android' | 'ios' | 'web'
        { name: 'platform', type: 'text', required: true },
        // Por debajo de este build el cliente se bloquea. 0 = desactivado.
        { name: 'min_supported_build', type: 'number', onlyInt: true, min: 0 },
        // Último build publicado; por debajo se muestra un aviso descartable.
        { name: 'latest_build', type: 'number', onlyInt: true, min: 0 },
        { name: 'latest_version', type: 'text' },
        { name: 'store_url', type: 'text' },
        // Clave i18n, NO texto: el servidor no sabe el idioma del cliente.
        { name: 'message_key', type: 'text' },
        { name: 'flags', type: 'json', maxSize: 20000 },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_app_config_platform ON app_config (platform)',
      ],
    })
  }

  // Bloqueada de par en par: solo la lee el hook con $app.
  cfg.listRule = null
  cfg.viewRule = null
  cfg.createRule = null
  cfg.updateRule = null
  cfg.deleteRule = null
  app.save(cfg)

  const seeds = [
    {
      platform: 'android',
      latest_build: 30, // = app.json → expo.android.versionCode al crear esto
      latest_version: '1.9.0',
      store_url: 'https://play.google.com/store/apps/details?id=tech.guille.calistenia',
    },
    { platform: 'ios', latest_build: 0, latest_version: '', store_url: '' },
    // La web se actualiza sola (service worker en modo prompt): manda build 0 y
    // el gate nunca la bloquea. La fila existe solo por los flags.
    { platform: 'web', latest_build: 0, latest_version: '', store_url: '' },
  ]

  for (const seed of seeds) {
    let rec
    try {
      rec = app.findFirstRecordByFilter('app_config', 'platform = {:p}', { p: seed.platform })
    } catch {
      rec = new Record(cfg)
      rec.set('platform', seed.platform)
      // Gate desactivado por defecto. Se sube a mano cuando hace falta.
      rec.set('min_supported_build', 0)
      rec.set('latest_build', seed.latest_build)
      rec.set('latest_version', seed.latest_version)
      rec.set('store_url', seed.store_url)
      rec.set('message_key', '')
      rec.set('flags', {})
      app.save(rec)
    }
  }
}, (app) => {
  const cfg = app.findCollectionByNameOrId('app_config')
  app.delete(cfg)
})
