/// <reference path="../pb_data/types.d.ts" />

/**
 * Miniatura `800x0` para la portada de los programas.
 *
 * `cover_image` solo declaraba `400x0` y `200x0`. La ficha de programa ya pedía
 * `?thumb=800x0` (`useProgramDetail`) y la portada a todo el ancho de la lista
 * móvil también la pide (`programCoverUrl`), pero un tamaño que el campo no
 * declara NO se genera: PocketBase sirve el ORIGINAL. Medido en local con una
 * portada de 1672×941: `400x0` = 78 KB, `800x0` = 1,5 MB (el PNG entero).
 *
 * Solo se añade el tamaño; el campo conserva su `id` (feedback_migration_safety)
 * y los existentes se quedan. PocketBase genera la miniatura la primera vez que
 * se pide, así que no hace falta tocar los ficheros ya subidos.
 *
 * IDEMPOTENTE: si `800x0` ya está, no se guarda nada.
 */

const PROGRAMS_COLLECTION_ID = "pbc_2970041692"
const THUMB = "800x0"

function thumbsOf(field) {
  const list = []
  const raw = field.thumbs || []
  for (let i = 0; i < raw.length; i++) list.push(String(raw[i]))
  return list
}

migrate((app) => {
  const programs = app.findCollectionByNameOrId(PROGRAMS_COLLECTION_ID)
  const field = programs.fields.getByName("cover_image")
  if (!field) {
    console.log("[programs_cover_thumb_800] sin campo cover_image, nada que hacer")
    return
  }
  const thumbs = thumbsOf(field)
  if (thumbs.indexOf(THUMB) !== -1) return
  thumbs.push(THUMB)
  field.thumbs = thumbs
  app.save(programs)
  console.log("[programs_cover_thumb_800] thumbs = " + thumbs.join(", "))
}, (app) => {
  const programs = app.findCollectionByNameOrId(PROGRAMS_COLLECTION_ID)
  const field = programs.fields.getByName("cover_image")
  if (!field) return
  field.thumbs = thumbsOf(field).filter(t => t !== THUMB)
  app.save(programs)
})
