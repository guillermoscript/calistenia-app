/// <reference path="../pb_data/types.d.ts" />

/**
 * #713 — Reetiqueta `goal_type`, `intensity`, `equipment_required` y
 * `contraindications` de los 15 programas oficiales para que casen con su
 * contenido (auditoría de entrenamiento del 2026-09-08, épica #711).
 *
 * POR QUÉ UNA MIGRACIÓN DE DATOS
 * ------------------------------
 * La verdad de estas etiquetas vive en `scripts/lib/program-catalog.mjs`
 * (`SKELETONS`), pero la siembra `1786100000` salta los programas que ya
 * existen y las resiembras (`pnpm programs:reseed`) solo se disparan cuando
 * cambia el CONTENIDO. Corregir la tabla no cambia ni una fila de producción:
 * hace falta esto (patrón de `1784700002`, SQL crudo, sin hooks).
 *
 * QUÉ ARREGLA
 * -----------
 * - 12 de 15 declaraban `contraindications: []` con colgado máximo, apoyo
 *   invertido de manos, nordic curl o pliometría dentro. Ahora las declaran y
 *   `matchPrograms.ts` penaliza el programa (`health_flag`) a quien marcó esa
 *   lesión en el onboarding.
 * - Glúteo + Tonificación era `fat_loss` sin un minuto de cardio → `muscle_gain`.
 * - Full Body Toning era `light` con fases de construcción/definición → `moderate`.
 * - Fuerza Total exige dominada lastrada y no declaraba `weight`; Ganar Músculo
 *   va a meter fondos en paralelas (#721) y no puede tocar el catálogo.
 * Cada decisión (incluidas las que se QUEDAN) está razonada en el propio
 * `program-catalog.mjs`, encima de `SKELETONS`.
 *
 * IDEMPOTENTE: cada UPDATE lleva en el WHERE «alguna de las cuatro columnas es
 * distinta», así que la segunda pasada afecta 0 filas. Los campos `json` se
 * comparan normalizados con `json()`; una fila con JSON inválido o vacío cuenta
 * como distinta y se reescribe.
 *
 * ALCANCE: solo `is_official = 1`. Se localiza por `slug` (backfill de
 * `1787100000`) y, si un entorno viejo no lo tuviera, por `name.es`. Las copias
 * de usuario ni se miran. «Intermedio – Balance Total» no está en la tabla.
 *
 * La tabla va copiada a mano: una migración no puede importar `scripts/`
 * (el Dockerfile de producción solo copia `pb_migrations/` y `pb_hooks/`).
 * `scripts/program-catalog.test.mjs` aplica esta migración sobre un PocketBase
 * real con los valores VIEJOS y contrasta las 15 filas contra `SKELETONS`.
 */

/** slug, name.es, goal_type, intensity, equipment_required, contraindications — espejo de SKELETONS. */
const RELABELS = [
  ["principiante-quema-grasa",    "Principiante · Quema Grasa",      "fat_loss",    "light",    [],                                          ["knee","ankle"]],
  ["principiante-ganar-musculo",  "Principiante · Ganar Músculo",    "muscle_gain", "moderate", ["pull_bar","parallel_bars"],                ["shoulder","elbow","knee"]],
  ["principiante-fundamentos",    "Principiante · Fundamentos",      "maintain",    "light",    [],                                          []],
  ["intermedio-definicion",       "Intermedio · Definición",         "fat_loss",    "intense",  ["pull_bar","parallel_bars"],                ["wrist","shoulder","elbow"]],
  ["intermedio-hipertrofia",      "Intermedio · Hipertrofia",        "muscle_gain", "moderate", ["pull_bar","parallel_bars"],                ["shoulder","elbow","wrist","knee"]],
  ["avanzado-cutting",            "Avanzado · Cutting Élite",        "fat_loss",    "intense",  ["pull_bar","parallel_bars","bands"],        ["wrist","shoulder","elbow"]],
  ["avanzado-volumen",            "Avanzado · Volumen Máximo",       "muscle_gain", "intense",  ["pull_bar","parallel_bars","bands"],        ["wrist","shoulder","elbow","knee"]],
  ["avanzado-fuerza-total",       "Avanzado · Fuerza Total",         "maintain",    "intense",  ["pull_bar","parallel_bars","bands","weight"], ["wrist","shoulder","elbow"]],
  ["pull-up-roadmap",             "Pull-up Roadmap",                 "skill",       "light",    ["pull_bar","bands"],                        ["elbow","shoulder"]],
  ["handstand-roadmap",           "Handstand Roadmap",               "skill",       "moderate", ["bands"],                                   ["wrist","shoulder"]],
  ["muscle-up-roadmap",           "Muscle-up Roadmap",               "skill",       "intense",  ["pull_bar","parallel_bars","bands","weight"], ["elbow","shoulder","wrist"]],
  ["planche-roadmap",             "Planche Roadmap",                 "skill",       "intense",  ["parallel_bars","pull_bar","bands","weight"], ["wrist","shoulder","elbow"]],
  ["mujer-gluteo-tonificacion",   "Mujer · Glúteo + Tonificación",   "muscle_gain", "moderate", ["bands"],                                   ["knee"]],
  ["mujer-full-body-toning",      "Mujer · Full Body Toning",        "maintain",    "moderate", [],                                          ["wrist","knee"]],
  ["mujer-fuerza-funcional",      "Mujer · Fuerza Funcional",        "muscle_gain", "moderate", ["pull_bar","bands","parallel_bars"],        ["shoulder","elbow","wrist","knee","lower_back"]],
]

const TAG = "[relabel_official_programs]"

migrate((app) => {
  try {
    let updated = 0
    let missing = []
    for (let i = 0; i < RELABELS.length; i++) {
      const row = RELABELS[i]
      const params = {
        slug: row[0],
        name_es: row[1],
        goal_type: row[2],
        intensity: row[3],
        equipment: JSON.stringify(row[4]),
        contraindications: JSON.stringify(row[5]),
      }

      // ¿Existe el oficial? Si no, se dice y se sigue: una base que no lo tiene
      // (entorno nuevo antes de sembrar) no es un error de esta migración.
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
      if (Number(count.n) === 0) {
        missing.push(row[0])
        continue
      }

      const result = app
        .db()
        .newQuery(`
          UPDATE programs
          SET goal_type = {:goal_type},
              intensity = {:intensity},
              equipment_required = {:equipment},
              contraindications = {:contraindications}
          WHERE is_official = 1
            AND (slug = {:slug} OR (slug = '' AND json_extract(name, '$.es') = {:name_es}))
            AND (
              goal_type IS NOT {:goal_type}
              OR intensity IS NOT {:intensity}
              OR json_valid(equipment_required) = 0
              OR json(equipment_required) IS NOT json({:equipment})
              OR json_valid(contraindications) = 0
              OR json(contraindications) IS NOT json({:contraindications})
            )
        `)
        .bind(params)
        .execute()
      updated += Number(result.rowsAffected()) || 0
    }

    console.log(
      TAG + " " + updated + " filas reetiquetadas de " + RELABELS.length +
      (missing.length ? " (sin fila oficial: " + missing.join(", ") + ")" : "")
    )
  } catch (err) {
    // Una migración que lanza deja a PocketBase sin arrancar. Si esto falla, las
    // etiquetas se quedan como hoy (mal, pero como hoy). Se reintenta borrando
    // la fila de `_migrations` y reiniciando.
    console.log(TAG + " FALLO, etiquetas sin actualizar:", err)
  }
}, (app) => {
  // Sin vuelta atrás: los valores previos se pueden reconstruir del historial
  // de git de `program-catalog.mjs`, y volver a ejecutar esto es idempotente.
})
