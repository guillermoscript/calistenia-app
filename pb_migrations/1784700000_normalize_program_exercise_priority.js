/// <reference path="../pb_data/types.d.ts" />

/**
 * Normaliza `priority` y rellena `section` en `program_exercises` (issue #607).
 *
 * Migracion de DATOS, no de esquema: no toca ningun campo de la coleccion, solo
 * los valores. Es re-ejecutable a proposito — cada UPDATE filtra por el valor
 * viejo, asi que la segunda pasada afecta 0 filas.
 *
 * QUE ARREGLA
 *
 * El JSON de los programas usa `primary|secondary|accessory` y ademas reutiliza
 * `priority` como marcador de seccion (`warmup`/`cooldown`). La app solo conoce
 * `high|med|low` (`Priority` en packages/core/types/index.ts, `PRIORITY_COLORS` en
 * packages/core/lib/style-tokens.ts). Los seeders copiaban el valor crudo, asi que
 * el 99 % de las filas caia al color de fallback:
 *
 *   primary 768 | secondary 36 | accessory 18 | med 4 | high 1
 *
 * Y 90 filas se quedaron con `section` vacia: son de «Intermedio - Balance Total»,
 * sembradas con `seed-program.mjs` (que nunca escribia `section`) DESPUES del
 * backfill de 1775100001_program_exercises_section.js. El mismo commit que trae
 * esta migracion arregla los cuatro seeders para que no vuelva a pasar.
 *
 *   main 609 | (vacia) 90 | cooldown 80 | warmup 48
 *
 * TODO EN SQL CRUDO, A PROPOSITO. Guardar con la API de records dispararia los
 * hooks de `program_exercises` sobre ~900 filas de golpe; aqui solo queremos
 * reescribir dos columnas.
 *
 * DETECCION DE SECCION POR NOMBRE
 *
 * `exercise_name` es un campo i18n: se guarda como el JSON `{"es":"...","en":"..."}`,
 * asi que el LIKE va contra ese texto crudo y cubre los dos idiomas de una vez.
 * Los marcadores son deliberadamente conservadores — solo lo que nombra
 * explicitamente un calentamiento o una vuelta a la calma. NO se busca
 * «movilidad» ni «estiramiento» sueltos: en estos programas son trabajo
 * principal (p.ej. «Movilidad de cadera (world's greatest stretch)» es un
 * ejercicio secundario del bloque main, no un calentamiento).
 */

// Vocabulario del JSON -> vocabulario de la app. Espejo de `PRIORITY_ALIASES` en
// scripts/lib/program-exercise-fields.mjs; si cambia uno, cambia el otro.
const PRIORITY_MAP = {
  primary: "high",
  secondary: "med",
  accessory: "low",
  // `warmup`/`cooldown` nunca fueron prioridades, solo marcaban seccion. La
  // seccion ya esta puesta en esas filas; aqui solo se les da una prioridad valida.
  warmup: "med",
  cooldown: "med",
}

// Prioridad para cualquier valor que no este en el mapa ni sea ya valido.
const FALLBACK_PRIORITY = "med"

// Marcadores explicitos de seccion en el nombre del ejercicio, en minusculas.
const SECTION_PATTERNS = {
  warmup: ["%calentamiento%", "%warm-up%", "%warm up%", "%warmup%"],
  cooldown: [
    "%enfriamiento%",
    "%vuelta a la calma%",
    "%cool-down%",
    "%cool down%",
    "%cooldown%",
  ],
}

migrate((app) => {
  try {
    let priorityFixed = 0
    let sectionFixed = 0

    // ── 1. priority: vocabulario del JSON -> enum de la app ──────────────────
    for (const from in PRIORITY_MAP) {
      const result = app
        .db()
        .newQuery(`UPDATE program_exercises SET priority = {:to} WHERE priority = {:from}`)
        .bind({ to: PRIORITY_MAP[from], from: from })
        .execute()
      priorityFixed += Number(result.rowsAffected()) || 0
    }

    // Cajon de sastre: lo que quede fuera del enum (vacio, NULL, un valor nuevo
    // que nadie mapeo) va a la prioridad por defecto. Sin esto una fila rara
    // seguiria pintando el fallback y esta migracion no habria servido de nada.
    const leftovers = app
      .db()
      .newQuery(`
        UPDATE program_exercises SET priority = {:fallback}
        WHERE priority IS NULL OR priority NOT IN ('high', 'med', 'low')
      `)
      .bind({ fallback: FALLBACK_PRIORITY })
      .execute()
    priorityFixed += Number(leftovers.rowsAffected()) || 0

    // ── 2. section vacia: warmup/cooldown por nombre, main por defecto ───────
    for (const section in SECTION_PATTERNS) {
      const patterns = SECTION_PATTERNS[section]
      for (let i = 0; i < patterns.length; i++) {
        const result = app
          .db()
          .newQuery(`
            UPDATE program_exercises SET section = {:section}
            WHERE (section IS NULL OR section = '')
              AND LOWER(exercise_name) LIKE {:pattern}
          `)
          .bind({ section: section, pattern: patterns[i] })
          .execute()
        sectionFixed += Number(result.rowsAffected()) || 0
      }
    }

    const rest = app
      .db()
      .newQuery(`
        UPDATE program_exercises SET section = 'main'
        WHERE section IS NULL OR section = ''
      `)
      .execute()
    sectionFixed += Number(rest.rowsAffected()) || 0

    console.log(
      "[normalize_program_exercise_priority] priority: " + priorityFixed +
      " filas, section: " + sectionFixed + " filas"
    )
  } catch (err) {
    // Una migracion que lanza deja a PocketBase sin arrancar. Si esto falla, los
    // datos se quedan como estan hoy (mal, pero como hoy), asi que preferimos
    // ruido en el log a tirar produccion. Se reintenta borrando la fila de
    // `_migrations` y reiniciando.
    console.log("[normalize_program_exercise_priority] FALLO, datos sin normalizar:", err)
  }
}, (app) => {
  // Sin vuelta atras: no hay snapshot de los valores previos y reconstruirlos
  // requeriria volver a sembrar desde los JSON de `programs/`. Volver a ejecutar
  // la migracion es idempotente, asi que no se pierde nada por no revertir.
})
