/// <reference path="../pb_data/types.d.ts" />

/**
 * Punto de foco de la portada: `programs.cover_focus`.
 *
 * La portada se recorta a 16:9 (lista y ficha de móvil) y a 2:1 (ficha de
 * escritorio), y ningún encuadre fijo sirve para todas las fotos. El autor
 * marca en el editor dónde está lo importante y las superficies lo usan como
 * `object-position` / `contentPosition` (`packages/core/lib/coverFocus.ts`).
 *
 * Texto «x y» en porcentajes enteros («50 30»). Vacío = centrado, que es lo que
 * reciben todos los programas existentes: no hay datos que migrar. El patrón es
 * el mismo que produce `formatCoverFocus` (lo comprueba `coverFocus.test.ts`);
 * PocketBase no valida el patrón de un texto opcional vacío.
 *
 * La resiembra de programas oficiales (`generate-program-seed-migration.mjs`)
 * no escribe este campo, igual que `cover_image`: el foco que ponga un editor
 * sobrevive a un `programs:reseed`.
 *
 * IDEMPOTENTE: si el campo ya existe no se guarda nada. El `id` es FIJO
 * (feedback_migration_safety).
 */

const PROGRAMS_COLLECTION_ID = "pbc_2970041692"
const FIELD_ID = "text_program_cover_focus"

migrate((app) => {
  const programs = app.findCollectionByNameOrId(PROGRAMS_COLLECTION_ID)
  if (programs.fields.find(f => f.name === "cover_focus")) return
  programs.fields.add(new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": FIELD_ID,
    "max": 7,
    "min": 0,
    "name": "cover_focus",
    "pattern": "^(100|[1-9]?[0-9]) (100|[1-9]?[0-9])$",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))
  app.save(programs)
  console.log("[programs_cover_focus] campo cover_focus añadido")
}, (app) => {
  const programs = app.findCollectionByNameOrId(PROGRAMS_COLLECTION_ID)
  programs.fields.removeById(FIELD_ID)
  app.save(programs)
})
