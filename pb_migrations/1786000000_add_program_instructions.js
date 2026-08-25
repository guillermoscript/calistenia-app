/// <reference path="../pb_data/types.d.ts" />

/**
 * #618 — `programs.instructions`: el bloque «cómo seguir este programa».
 *
 * Boostcamp y Hevy enseñan, debajo de la descripción, unas notas del autor
 * sobre cómo llevar el programa (qué días mover, cuándo subir carga, qué hacer
 * si te saltas una semana). Aquí no había dónde guardarlas: `description` es la
 * frase corta que se pinta en la tarjeta del catálogo, y meter ahí medio folio
 * rompe el listado.
 *
 * Es `json` y no `text` por el mismo motivo que `name` y `description`: el
 * contenido va como `{ es: "...", en: "..." }` y se lee siempre con
 * `localize()` (packages/core/lib/i18n-db.ts). Interpolar el campo crudo en una
 * plantilla imprime `[object Object]`.
 *
 * No hay backfill: un programa sin notas es el caso normal y la UI se limita a
 * no pintar el bloque. `maxSize` es el tope en bytes del JSON serializado;
 * 20 KB dan de sobra para el markdown corto que espera la ficha y evitan que
 * alguien pegue un libro entero en una fila que se lee en cada detalle.
 */
migrate((app) => {
  const programs = app.findCollectionByNameOrId("pbc_2970041692")

  programs.fields.add(new Field({
    "hidden": false,
    "id": "json_prog_instr",
    "maxSize": 20480,
    "name": "instructions",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  app.save(programs)
}, (app) => {
  try {
    const programs = app.findCollectionByNameOrId("pbc_2970041692")
    programs.fields.removeById("json_prog_instr")
    app.save(programs)
  } catch (e) {
    // La colección no existe: nada que revertir.
  }
})
