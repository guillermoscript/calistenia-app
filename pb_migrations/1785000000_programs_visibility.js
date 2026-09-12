/// <reference path="../pb_data/types.d.ts" />

/**
 * #603 — `programs`: no existía el concepto de programa privado.
 *
 * Las cuatro colecciones del dominio (`programs`, `program_phases`,
 * `program_exercises`, `program_day_config`) tenían `listRule`/`viewRule` =
 * `@request.auth.id != ""`, heredado literal de su creación
 * (1773251038_created_programs.js:77,82 y hermanas). #600 endureció create y
 * update, pero no tocó la lectura. Consecuencia: cualquier persona autenticada
 * listaba y leía los programas de todo el mundo. Y como `saveProgram`
 * (packages/core/hooks/useProgramEditor.ts) fuerza `is_active: true` en cada
 * guardado, un programa a medio escribir aparecía en el catálogo de todos desde
 * el primer teclazo.
 *
 * Esta migración añade `visibility` (private | link | public) y filtra la
 * lectura por él. Es el Escenario A de docs/schema-evolution.md: el agujero se
 * cierra en el servidor, la única capa con alcance del 100% (no hay OTA en
 * móvil). La UI es el acompañamiento, no el arreglo.
 *
 * BACKFILL: todo lo que ya existe pasa a `public`. Hoy ya lo es *de facto* —
 * cualquier autenticado lo veía —, así que nadie pierde acceso a nada que ya
 * tuviera. Eso cubre de un golpe el requisito «is_official ⇒ public»: los
 * oficiales son un subconjunto de los existentes.
 *
 * `link` entra en el enum pero NO en las reglas: en la API de colección se
 * comporta como `private` (solo dueño/admin/editor). Se vuelve alcanzable
 * cuando #604 monte la landing anónima `/shared/:id` en `pb_hooks`, que sirve
 * el programa con `$app` y se salta las rules a propósito. Aquí NO se abre
 * `viewRule` a anónimos.
 *
 * DOS COSAS QUE HAY QUE TENER PRESENTES AL DESPLEGAR:
 *
 *  1. Endurecer una regla de lectura en PocketBase NO devuelve 403: devuelve
 *     0 filas, sin error. Si alguna de estas reglas estuviera mal escrita, el
 *     síntoma sería un catálogo vacío, no una excepción. Por eso
 *     tests/pb_hooks/programs_visibility.test.mjs afirma también los casos
 *     POSITIVOS (dueño, admin, público), no solo el negativo.
 *
 *  2. Un cliente móvil viejo que cree un programa no manda `visibility`, así
 *     que la fila nace con el campo vacío y se trata como privada. Es la
 *     dirección segura (nada se filtra), pero esa persona no podrá publicar
 *     hasta actualizar la app. El campo va `required: false` a propósito:
 *     exigirlo daría 400 en cada escritura de esos clientes, y
 *     scripts/check-schema-contract.mjs lo rechazaría (su regla es un regex
 *     literal, así que ni siquiera se puede nombrar la bandera en un
 *     comentario).
 *
 * Las reglas van literales DENTRO de cada callback a propósito: el JSVM de PB
 * no garantiza que el scope del módulo llegue al callback, y una constante que
 * saliera `undefined` aquí borraría la regla en silencio (ver 1784700000).
 */
migrate((app) => {
  const programs = app.findCollectionByNameOrId("programs")

  if (!programs.fields.find(f => f.name === "visibility")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "select_program_visibility",
      "maxSelect": 1,
      "name": "visibility",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "select",
      "values": ["private", "link", "public"]
    }))
  }

  // El campo tiene que existir en la tabla antes del UPDATE de abajo.
  app.save(programs)

  // Backfill: lo que ya existía era público de facto.
  app.db().newQuery(
    "UPDATE programs SET visibility = 'public' WHERE visibility IS NULL OR visibility = ''"
  ).execute()

  // ── Lectura de `programs` ───────────────────────────────────────────────
  // Público para todos, privado (y `link`) solo para su autor. admin/editor
  // conservan la visión completa para poder curar el catálogo; no es un
  // agujero: 1774000056_harden_users_security.js:25 impide que nadie se
  // auto-asigne `role` por PATCH.
  const programsRead = '@request.auth.id != "" && (' +
    'visibility = "public" || ' +
    'created_by = @request.auth.id || ' +
    '@request.auth.role = "admin" || ' +
    '@request.auth.role = "editor"' +
  ')'
  programs.listRule = programsRead
  programs.viewRule = programsRead
  app.save(programs)

  // ── Lectura de las hijas ────────────────────────────────────────────────
  // La condición viaja por la relación `program`, igual que ya hacen las
  // reglas de escritura de program_day_config (1774378002:178) y la lectura
  // de community_program_milestones (1783800000:91).
  const childRead = '@request.auth.id != "" && (' +
    'program.visibility = "public" || ' +
    'program.created_by = @request.auth.id || ' +
    '@request.auth.role = "admin" || ' +
    '@request.auth.role = "editor"' +
  ')'

  for (const name of ["program_phases", "program_exercises", "program_day_config"]) {
    const child = app.findCollectionByNameOrId(name)
    child.listRule = childRead
    child.viewRule = childRead
    app.save(child)
  }

  // createRule/updateRule NO se tocan. Las de #600 ya exigen
  // `created_by = @request.auth.id` para editar, así que solo el autor puede
  // cambiar la visibilidad de su programa — que es justo lo que queremos.
}, (app) => {
  try {
    const previous = '@request.auth.id != ""'

    for (const name of ["program_phases", "program_exercises", "program_day_config"]) {
      const child = app.findCollectionByNameOrId(name)
      child.listRule = previous
      child.viewRule = previous
      app.save(child)
    }

    const programs = app.findCollectionByNameOrId("programs")
    programs.listRule = previous
    programs.viewRule = previous
    programs.fields.removeById("select_program_visibility")
    app.save(programs)
  } catch (e) {}
})
