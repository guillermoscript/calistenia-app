/// <reference path="../pb_data/types.d.ts" />

/**
 * #935 — Rutas entre programas: `programs.next_programs`.
 *
 * Al terminar un programa la app recomendaba otro solo por nivel, y podía
 * proponer uno del mismo nivel o más fácil. Ahora cada oficial declara a dónde
 * se sigue (Pull-up Roadmap → Muscle-up Roadmap, Principiante → Intermedio…), y
 * `packages/core/lib/nextProgram.ts` lo usa antes que cualquier otro criterio.
 *
 * CAMPO
 * -----
 * `next_programs` (json): lista ORDENADA de slugs. Slugs y no ids de relación
 * porque los ids cambian entre entornos y porque una relación obligaría a
 * sembrar en orden. Vacío en todo lo creado por usuarios.
 *
 * DATOS
 * -----
 * Los 16 oficiales reciben su ruta según `SKELETONS`
 * (`scripts/lib/program-catalog.mjs`), localizados por `slug` (los 16 lo tienen
 * desde `1789300000`). La tabla va copiada a mano: una migración no puede
 * importar `scripts/` (el Dockerfile de producción solo copia `pb_migrations/`
 * y `pb_hooks/`). `scripts/program-catalog.test.mjs` contrasta esta tabla con
 * `SKELETONS` y aplica la migración sobre un PocketBase real.
 *
 * No hace falta tocar la siembra `1786100000`: en una instalación limpia corre
 * antes que esta migración, que rellena el campo igual que en producción.
 *
 * IDEMPOTENTE: el UPDATE lleva en el WHERE «el JSON es distinto»; la segunda
 * pasada afecta 0 filas. El id de campo es FIJO (feedback_migration_safety).
 * ALCANCE: solo `is_official = 1`. Las copias de usuario ni se miran.
 */

const PROGRAMS_COLLECTION_ID = "pbc_2970041692"
const TAG = "[programs_next_programs_935]"

/** slug → next_programs, espejo de SKELETONS. */
const NEXT_PROGRAMS = [
  ["principiante-quema-grasa",   ["intermedio-definicion", "principiante-ganar-musculo"]],
  ["principiante-ganar-musculo", ["intermedio-hipertrofia", "pull-up-roadmap"]],
  ["principiante-fundamentos",   ["principiante-ganar-musculo", "pull-up-roadmap"]],
  ["intermedio-definicion",      ["avanzado-cutting"]],
  ["intermedio-hipertrofia",     ["avanzado-volumen"]],
  ["intermedio-balance-total",   ["avanzado-fuerza-total", "muscle-up-roadmap"]],
  ["avanzado-cutting",           []],
  ["avanzado-volumen",           []],
  ["avanzado-fuerza-total",      []],
  ["pull-up-roadmap",            ["muscle-up-roadmap", "intermedio-hipertrofia"]],
  ["handstand-roadmap",          ["planche-roadmap"]],
  ["muscle-up-roadmap",          ["avanzado-fuerza-total", "planche-roadmap"]],
  ["planche-roadmap",            []],
  ["mujer-gluteo-tonificacion",  ["mujer-fuerza-funcional"]],
  ["mujer-full-body-toning",     ["mujer-fuerza-funcional"]],
  ["mujer-fuerza-funcional",     ["avanzado-fuerza-total", "muscle-up-roadmap"]],
]

migrate((app) => {
  const programs = app.findCollectionByNameOrId(PROGRAMS_COLLECTION_ID)

  if (!programs.fields.find(f => f.name === "next_programs")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "json_program_next_programs",
      "maxSize": 2000,
      "name": "next_programs",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    }))
    app.save(programs)
    console.log(TAG + " campo añadido")
  }

  try {
    let updated = 0
    const missing = []
    for (let i = 0; i < NEXT_PROGRAMS.length; i++) {
      const row = NEXT_PROGRAMS[i]
      const params = { slug: row[0], next: JSON.stringify(row[1]) }
      const result = app
        .db()
        .newQuery(`
          UPDATE programs
          SET next_programs = {:next}
          WHERE is_official = 1
            AND slug = {:slug}
            AND (
              next_programs IS NULL
              OR json_valid(next_programs) = 0
              OR json(next_programs) IS NOT json({:next})
            )
        `)
        .bind(params)
        .execute()
      const n = Number(result.rowsAffected()) || 0
      if (n === 0) {
        // 0 filas: o ya estaba bien o no existe. Solo se avisa si no existe.
        const count = new DynamicModel({ n: 0 })
        app
          .db()
          .newQuery("SELECT COUNT(*) AS n FROM programs WHERE is_official = 1 AND slug = {:slug}")
          .bind({ slug: params.slug })
          .one(count)
        if (Number(count.n) === 0) missing.push(row[0])
      }
      updated += n
    }
    console.log(
      TAG + " " + updated + " rutas escritas de " + NEXT_PROGRAMS.length +
      (missing.length ? " (sin fila oficial: " + missing.join(", ") + ")" : "")
    )
  } catch (err) {
    // Una migración que lanza deja a PocketBase sin arrancar. Si falla, el
    // campo existe vacío y la app cae a la recomendación por nivel; se
    // reintenta borrando la fila de `_migrations` y reiniciando.
    console.log(TAG + " FALLO, rutas sin escribir:", err)
  }
}, (app) => {
  const programs = app.findCollectionByNameOrId(PROGRAMS_COLLECTION_ID)
  programs.fields.removeById("json_program_next_programs")
  app.save(programs)
})
