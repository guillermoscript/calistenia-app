/// <reference path="../pb_data/types.d.ts" />

/**
 * Qué versión usa cada usuario — la mitad que faltaba de la cabecera X-App-*.
 *
 * POR QUÉ HACE FALTA PERSISTIRLO: la cabecera sola no responde a la única
 * pregunta que importa, que es "¿ya puedo borrar este campo del esquema?"
 * (la fase contract de expand/contract, docs/schema-evolution.md). Para eso hay
 * que poder consultar la distribución de builds vivos, no rebuscar en logs.
 *
 * Con esto, la consulta es directa desde el admin de PocketBase:
 *   users, filtro: last_seen_at >= "<hace 30 días>" && app_build < 31
 *
 * PRIVACIDAD: no hace falta tocar nada. `pb_hooks/users_field_privacy.pb.js`
 * funciona con LISTA BLANCA — un campo nuevo en `users` nace privado y solo lo
 * ve su dueño (y superuser/admin). Estos cuatro no están en PUBLIC, así que ya
 * están escondidos para terceros.
 *
 * Ninguno es `required`: los rellena un hook después de autenticar, y las filas
 * que ya existen se quedan vacías hasta el siguiente login de ese usuario.
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId('users')

  const add = (field) => {
    // Idempotente: re-ejecutar la migración no duplica ni pisa nada.
    if (users.fields.find((f) => f.name === field.name)) return
    users.fields.add(new Field(field))
  }

  // Entero monótono del build (Android: versionCode). Es el que se compara;
  // `app_version` es solo para leerlo con ojos humanos.
  add({ name: 'app_build', type: 'number', onlyInt: true, min: 0 })
  add({ name: 'app_version', type: 'text' })
  add({ name: 'app_platform', type: 'text' })
  // Sin esto, la distribución de builds cuenta también cuentas muertas de hace
  // dos años y el porcentaje de "clientes viejos" nunca baja del umbral.
  add({ name: 'last_seen_at', type: 'date' })

  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId('users')
  for (const name of ['app_build', 'app_version', 'app_platform', 'last_seen_at']) {
    const field = users.fields.find((f) => f.name === name)
    if (field) users.fields.removeById(field.id)
  }
  app.save(users)
})
