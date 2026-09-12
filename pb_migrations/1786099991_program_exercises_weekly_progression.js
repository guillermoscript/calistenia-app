/// <reference path="../pb_data/types.d.ts" />
//
// #755 — progresión semanal dentro de la fase.
//
// Hasta aquí una fila de `program_exercises` era FIJA por fase: `sets`, `reps`
// y `timer_seconds` valían lo mismo las cuatro semanas del rango, así que toda
// progresión intrasemanal solo podía escribirse en la `note`, en prosa. Este
// campo es donde una fila declara cómo cambia dentro de su fase; lo aplica
// `applyWeeklyProgression` (`packages/core/lib/weeklyProgression.ts`) al
// construir la sesión, con la semana en curso.
//
// `json` y no varias columnas numéricas a propósito: una rampa es una lista de
// objetos `{ field, step | values, min?, max? }` y un ejercicio puede declarar
// más de una (series y repeticiones a la vez, por ejemplo).
//
// Timestamp ANTERIOR a la siembra `1786100000_seed_official_programs.js`, por
// la misma razón que `1786099990` (#716): PocketBase aplica toda migración que
// no esté en `_migrations`, en orden de nombre, así que en prod entra igual;
// pero en una base fresca (CI, local) la columna tiene que existir ANTES de que
// la siembra y las resiembras (`pnpm programs:reseed`, que la insertan por SQL
// crudo) escriban en ella. Con el timestamp detrás, la siembra fresca fallaría
// —o peor, se tragaría el campo en silencio por la API de records.
//
// SIN backfill y SIN `required`: la ausencia del campo es exactamente el
// comportamiento de antes de #755, que es lo que tienen que seguir viendo las
// filas ya sembradas. El contenido lo va poniendo cada programa en su issue.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("program_exercises")

  // Idempotencia: la colección puede venir ya con el campo de una siembra
  // posterior a esta migración.
  const existing = collection.fields.find(f => f.name === "weekly_progression")
  if (existing) return

  collection.fields.add(new Field({
    name: "weekly_progression",
    type: "json",
    required: false,
  }))

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("program_exercises")
  collection.fields.removeByName("weekly_progression")
  app.save(collection)
})
