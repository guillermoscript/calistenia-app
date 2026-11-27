/// <reference path="../pb_data/types.d.ts" />

/**
 * `sleep_entries.awakenings` deja de ser obligatorio.
 *
 * PocketBase trata el 0 de un campo number `required` como VACÍO, así que
 * cualquier registro con «0 despertares» daba 400: el manual (0 es el valor por
 * defecto en SleepLoggerSheet / SleepForm / SleepLumbarSection) y TODAS las
 * noches importadas de Health Connect (que no conoce los despertares).
 *
 * Se toca el campo existente in situ para conservar su `id` (y sus datos).
 */
migrate((app) => {
  const col = app.findCollectionByNameOrId("sleep_entries")
  const field = col.fields.getByName("awakenings")
  if (!field || !field.required) return
  field.required = false
  app.save(col)
}, (app) => {
  const col = app.findCollectionByNameOrId("sleep_entries")
  const field = col.fields.getByName("awakenings")
  if (!field) return
  field.required = true
  app.save(col)
})
