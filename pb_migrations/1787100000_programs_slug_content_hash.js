/// <reference path="../pb_data/types.d.ts" />

/**
 * #712 — `programs.slug` y `programs.content_hash`: las dos columnas que hacen
 * posible RESEMBRAR el contenido oficial.
 *
 * EL PROBLEMA QUE RESUELVEN
 * -------------------------
 * `1786100000_seed_official_programs.js` es idempotente por `name.es`: si el
 * programa existe, se salta ENTERO. Así que corregir `programs/<slug>.json` y
 * regenerar la siembra no cambia producción ni un carácter — la base lleva el
 * contenido del día en que se sembró. La épica #711 corrige los quince
 * programas, y sin un mecanismo de resiembra ninguna de esas correcciones
 * llegaría a un usuario.
 *
 * `slug`
 *   Clave ESTABLE entre `programs/<slug>.json` y la fila. Hasta hoy el único
 *   nexo era `name.es`, que es texto de producto: en cuanto alguien retoque un
 *   nombre, la resiembra dejaría de encontrar su programa y —peor— lo trataría
 *   como inexistente sin romper nada visible.
 *
 * `content_hash`
 *   sha256 del payload con el que se resembró por última vez. Es lo que hace
 *   que la segunda pasada de una resiembra sea un no-op: sin él, y como
 *   `pocketbase serve` repasa todas las migraciones en cada arranque, cada
 *   reinicio borraría y recrearía cientos de filas hijas.
 *
 * SIN ÍNDICE ÚNICO EN `slug`
 * --------------------------
 * A propósito. Los programas de usuario (`is_official = 0`, incluidas las copias
 * de `duplicateProgram`) se quedan con `slug = ''`, y un único con cientos de
 * cadenas vacías sería imposible. La unicidad que importa —un solo oficial por
 * slug— la comprueba la propia resiembra: si el SELECT devuelve más de una
 * fila, no toca ninguna y lo dice en el log.
 *
 * BACKFILL
 * --------
 * Se rellena `slug` en los quince oficiales cruzando por `name.es`, que es el
 * ÚNICO nexo que existe con las filas ya sembradas. Va en SQL crudo, sin la API
 * de records, para no disparar los hooks de `programs` quince veces.
 *
 * El mapa va copiado a mano: una migración no puede importar
 * `scripts/lib/program-catalog.mjs` (el Dockerfile de producción solo copia
 * `pb_migrations/` y `pb_hooks/`, así que `scripts/` no existe dentro del
 * contenedor). `scripts/reseed-program.test.mjs` contrasta este mapa contra
 * `SKELETONS` para que no se separen.
 *
 * «Intermedio – Balance Total» NO está: es un programa preexistente que el
 * seeder reetiqueta en vez de crear, y no tiene fichero de contenido. Se queda
 * con `slug = ''` y por tanto fuera del alcance de cualquier resiembra.
 *
 * Down: quita los dos campos. Perder el hash es inocuo — la siguiente resiembra
 * simplemente vuelve a escribir el contenido en lugar de saltárselo.
 */

const PROGRAMS_COLLECTION_ID = "pbc_2970041692"

/** slug → name.es, espejo de SKELETONS en scripts/lib/program-catalog.mjs. */
const SLUG_BY_NAME_ES = [
  ["principiante-quema-grasa", "Principiante · Quema Grasa"],
  ["principiante-ganar-musculo", "Principiante · Ganar Músculo"],
  ["principiante-fundamentos", "Principiante · Fundamentos"],
  ["intermedio-definicion", "Intermedio · Definición"],
  ["intermedio-hipertrofia", "Intermedio · Hipertrofia"],
  ["avanzado-cutting", "Avanzado · Cutting Élite"],
  ["avanzado-volumen", "Avanzado · Volumen Máximo"],
  ["avanzado-fuerza-total", "Avanzado · Fuerza Total"],
  ["pull-up-roadmap", "Pull-up Roadmap"],
  ["handstand-roadmap", "Handstand Roadmap"],
  ["muscle-up-roadmap", "Muscle-up Roadmap"],
  ["planche-roadmap", "Planche Roadmap"],
  ["mujer-gluteo-tonificacion", "Mujer · Glúteo + Tonificación"],
  ["mujer-full-body-toning", "Mujer · Full Body Toning"],
  ["mujer-fuerza-funcional", "Mujer · Fuerza Funcional"],
]

migrate((app) => {
  const TAG = "[programs_slug_content_hash]"
  const programs = app.findCollectionByNameOrId(PROGRAMS_COLLECTION_ID)
  let added = 0

  // Ids de campo FIJOS: cambiarlos en una reaplicación haría que PocketBase
  // viera un campo distinto y recreara la columna, perdiendo el contenido
  // (ver feedback_migration_safety).
  if (!programs.fields.find(f => f.name === "slug")) {
    programs.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_program_slug",
      "max": 0,
      "min": 0,
      "name": "slug",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
    added++
  }

  if (!programs.fields.find(f => f.name === "content_hash")) {
    programs.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_program_content_hash",
      "max": 0,
      "min": 0,
      "name": "content_hash",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
    added++
  }

  if (added) app.save(programs)

  // Backfill. Solo oficiales y solo si el slug sigue vacío: una fila que ya
  // tiene slug la puso una pasada anterior (o una resiembra) y manda ella.
  try {
    for (let i = 0; i < SLUG_BY_NAME_ES.length; i++) {
      app.db()
        .newQuery(
          "UPDATE programs SET slug = {:slug} WHERE is_official = 1 AND slug = '' " +
          "AND json_extract(name, '$.es') = {:name}"
        )
        .bind({ slug: SLUG_BY_NAME_ES[i][0], name: SLUG_BY_NAME_ES[i][1] })
        .execute()
    }

    // Se cuenta con un SELECT en vez de sumar los `rowsAffected` de cada UPDATE:
    // el `sql.Result` que devuelve `execute()` no expone el conteo de forma
    // fiable desde goja, y un log que dijera «15» pasara lo que pasara sería
    // exactamente el tipo de señal falsa que hace perder una tarde.
    const counted = arrayOf(new DynamicModel({ n: 0 }))
    app.db()
      .newQuery("SELECT COUNT(*) AS n FROM programs WHERE is_official = 1 AND slug != ''")
      .all(counted)
    const filled = counted.length ? counted[0].n : -1

    console.log(
      TAG + " campos añadidos: " + added + "; oficiales con slug tras el backfill: " +
      filled + " de " + SLUG_BY_NAME_ES.length + " esperados."
    )
  } catch (err) {
    // No relanzar: una migración que lanza deja a PocketBase sin arrancar. Sin
    // backfill, la resiembra sigue funcionando por el camino de `name.es`.
    console.log(TAG + " FALLO en el backfill de slug (los campos sí están):", err)
  }
}, (app) => {
  const programs = app.findCollectionByNameOrId(PROGRAMS_COLLECTION_ID)
  programs.fields.removeByName("slug")
  programs.fields.removeByName("content_hash")
  app.save(programs)
})
