/// <reference path="../pb_data/types.d.ts" />

/**
 * #717 — «PARA TI» nunca recomendaba los programas «Mujer ·» y la celda
 * intermedio + mantener no tenía programa.
 *
 * DOS CAMPOS NUEVOS EN `programs`
 * -------------------------------
 * - `for_women` (bool): variante «Mujer ·» de su celda nivel × objetivo.
 *   `matchPrograms.ts` la prefiere cuando el onboarding recibió
 *   `sex === 'female'` y prefiere el genérico en cualquier otro caso. Se marca
 *   con un campo y no por el prefijo del nombre: el nombre es texto de producto.
 * - `sort_order` (number): desempate explícito del catálogo curado cuando ni el
 *   sexo ni `is_featured` deciden. 0 = sin orden (todo lo creado por usuarios).
 *
 * DATOS
 * -----
 * 1. Los 15 oficiales reciben `for_women` y `sort_order` según `SKELETONS`
 *    (`scripts/lib/program-catalog.mjs`), localizados por `slug` y, si un
 *    entorno viejo no lo tuviera, por `name.es` (patrón de `1788881000`).
 * 2. «Intermedio – Balance Total», el programa preexistente que cubre
 *    intermedio + mantener, por fin queda etiquetado. `1776600000` lo intentó
 *    con `rec.get("name").es`, que en goja devuelve bytes, no un objeto: el
 *    `includes` nunca casó y la fila siguió con `goal_type` vacío (verificado
 *    en la copia de prod del 2026-08-30). Aquí va en SQL crudo por `name.es`
 *    y recibe además su `slug`, para que la próxima migración lo encuentre sin
 *    depender del nombre. No entra en `SKELETONS`: su contenido (90 filas sin
 *    `exercise_id`) es una issue de contenido aparte.
 *
 * IDEMPOTENTE: cada UPDATE lleva en el WHERE «algo es distinto»; la segunda
 * pasada afecta 0 filas. Los ids de campo son FIJOS (feedback_migration_safety).
 * ALCANCE: solo `is_official = 1`. Las copias de usuario ni se miran.
 */

const PROGRAMS_COLLECTION_ID = "pbc_2970041692"
const TAG = "[programs_for_women_sort_order]"

/** slug, name.es, for_women, sort_order — espejo de SKELETONS. */
const LABELS = [
  ["principiante-quema-grasa",    "Principiante · Quema Grasa",      0, 10],
  ["principiante-ganar-musculo",  "Principiante · Ganar Músculo",    0, 20],
  ["principiante-fundamentos",    "Principiante · Fundamentos",      0, 30],
  ["intermedio-definicion",       "Intermedio · Definición",         0, 40],
  ["intermedio-hipertrofia",      "Intermedio · Hipertrofia",        0, 50],
  ["avanzado-cutting",            "Avanzado · Cutting Élite",        0, 60],
  ["avanzado-volumen",            "Avanzado · Volumen Máximo",       0, 70],
  ["avanzado-fuerza-total",       "Avanzado · Fuerza Total",         0, 80],
  ["pull-up-roadmap",             "Pull-up Roadmap",                 0, 90],
  ["handstand-roadmap",           "Handstand Roadmap",               0, 100],
  ["muscle-up-roadmap",           "Muscle-up Roadmap",               0, 110],
  ["planche-roadmap",             "Planche Roadmap",                 0, 120],
  ["mujer-gluteo-tonificacion",   "Mujer · Glúteo + Tonificación",   1, 130],
  ["mujer-full-body-toning",      "Mujer · Full Body Toning",        1, 140],
  ["mujer-fuerza-funcional",      "Mujer · Fuerza Funcional",        1, 150],
]

/** El preexistente: entre Hipertrofia (50) y Cutting (60). */
const BALANCE_TOTAL = {
  slug: "intermedio-balance-total",
  name_es: "Intermedio – Balance Total",
  goal_type: "maintain",
  intensity: "moderate",
  days_per_week: 6,
  equipment: JSON.stringify(["pull_bar", "parallel_bars", "bands"]),
  contraindications: JSON.stringify(["lower_back"]),
  sort_order: 55,
}

migrate((app) => {
  const programs = app.findCollectionByNameOrId(PROGRAMS_COLLECTION_ID)
  let added = 0

  if (!programs.fields.find(f => f.name === "for_women")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "bool_program_for_women",
      "name": "for_women",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "bool"
    }))
    added++
  }

  if (!programs.fields.find(f => f.name === "sort_order")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "number_program_sort_order",
      "max": null,
      "min": 0,
      "name": "sort_order",
      "onlyInt": true,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
    added++
  }

  if (added > 0) app.save(programs)
  console.log(TAG + " campos añadidos: " + added)

  try {
    let updated = 0
    let missing = []
    for (let i = 0; i < LABELS.length; i++) {
      const row = LABELS[i]
      const params = { slug: row[0], name_es: row[1], for_women: row[2], sort_order: row[3] }
      const result = app
        .db()
        .newQuery(`
          UPDATE programs
          SET for_women = {:for_women},
              sort_order = {:sort_order}
          WHERE is_official = 1
            AND (slug = {:slug} OR (slug = '' AND json_extract(name, '$.es') = {:name_es}))
            AND (for_women IS NOT {:for_women} OR sort_order IS NOT {:sort_order})
        `)
        .bind(params)
        .execute()
      const n = Number(result.rowsAffected()) || 0
      if (n === 0) {
        // 0 filas: o ya estaba bien o no existe. Solo se avisa si no existe.
        const found = app
          .db()
          .newQuery(`
            SELECT COUNT(*) AS n FROM programs
            WHERE is_official = 1
              AND (slug = {:slug} OR (slug = '' AND json_extract(name, '$.es') = {:name_es}))
          `)
          .bind({ slug: params.slug, name_es: params.name_es })
        const count = new DynamicModel({ n: 0 })
        found.one(count)
        if (Number(count.n) === 0) missing.push(row[0])
      }
      updated += n
    }
    console.log(
      TAG + " " + updated + " filas etiquetadas de " + LABELS.length +
      (missing.length ? " (sin fila oficial: " + missing.join(", ") + ")" : "")
    )

    // Balance Total: `slug` solo si está vacío (no se pisa uno ya puesto), el
    // resto de etiquetas siempre que difieran. `LIKE` y no `=`: el nombre lleva
    // un guion largo que alguna edición manual pudo cambiar por uno corto.
    const bt = app
      .db()
      .newQuery(`
        UPDATE programs
        SET slug = CASE WHEN slug = '' THEN {:slug} ELSE slug END,
            goal_type = {:goal_type},
            intensity = {:intensity},
            days_per_week = {:days_per_week},
            equipment_required = {:equipment},
            contraindications = {:contraindications},
            for_women = 0,
            sort_order = {:sort_order}
        WHERE is_official = 1
          AND (slug = {:slug} OR (slug = '' AND json_extract(name, '$.es') LIKE '%Balance Total%'))
          AND (
            slug = ''
            OR goal_type IS NOT {:goal_type}
            OR intensity IS NOT {:intensity}
            OR days_per_week IS NOT {:days_per_week}
            OR json_valid(equipment_required) = 0
            OR json(equipment_required) IS NOT json({:equipment})
            OR json_valid(contraindications) = 0
            OR json(contraindications) IS NOT json({:contraindications})
            OR for_women IS NOT 0
            OR sort_order IS NOT {:sort_order}
          )
      `)
      .bind(BALANCE_TOTAL)
      .execute()
    console.log(TAG + " Balance Total: " + (Number(bt.rowsAffected()) || 0) + " fila(s) etiquetadas")
  } catch (err) {
    // Una migración que lanza deja a PocketBase sin arrancar. Si falla, los
    // campos existen y los datos se quedan como hoy; se reintenta borrando la
    // fila de `_migrations` y reiniciando.
    console.log(TAG + " FALLO, datos sin etiquetar:", err)
  }
}, (app) => {
  const programs = app.findCollectionByNameOrId(PROGRAMS_COLLECTION_ID)
  programs.fields.removeById("bool_program_for_women")
  programs.fields.removeById("number_program_sort_order")
  app.save(programs)
})
