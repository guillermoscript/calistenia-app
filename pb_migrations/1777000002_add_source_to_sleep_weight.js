/// <reference path="../pb_data/types.d.ts" />

/**
 * Tag existing manual-log collections so health-hub imports can coexist with
 * user-entered rows without clobbering them.
 *
 * - sleep_entries  += source, external_id
 * - weight_entries += source, external_id, body_fat_pct
 *
 * `source` is an optional select; an empty value is treated as "manual" by the
 * client (existing rows are unaffected). `external_id` carries the hub record
 * id for idempotent de-dup. body_fat_pct is brand-new — no body-fat field
 * existed anywhere before; nullable so existing weight rows are unaffected.
 */
migrate((app) => {
  const sourceField = (id) => new Field({
    "hidden": false,
    "id": id,
    "maxSelect": 1,
    "name": "source",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": ["health_connect", "healthkit", "manual"]
  })
  const externalIdField = (id) => new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": id,
    "max": 255,
    "min": 0,
    "name": "external_id",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  })

  const sleep = app.findCollectionByNameOrId("sleep_entries")
  if (!sleep.fields.find(f => f.name === "source")) sleep.fields.add(sourceField("select_sleep_source"))
  if (!sleep.fields.find(f => f.name === "external_id")) sleep.fields.add(externalIdField("text_sleep_external_id"))
  app.save(sleep)

  const weight = app.findCollectionByNameOrId("weight_entries")
  if (!weight.fields.find(f => f.name === "source")) weight.fields.add(sourceField("select_weight_source"))
  if (!weight.fields.find(f => f.name === "external_id")) weight.fields.add(externalIdField("text_weight_external_id"))
  if (!weight.fields.find(f => f.name === "body_fat_pct")) {
    weight.fields.add(new Field({
      "hidden": false,
      "id": "number_weight_body_fat",
      "max": 100,
      "min": 0,
      "name": "body_fat_pct",
      "onlyInt": false,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }
  app.save(weight)
}, (app) => {
  try {
    const sleep = app.findCollectionByNameOrId("sleep_entries")
    sleep.fields = sleep.fields.filter(f => !["select_sleep_source", "text_sleep_external_id"].includes(f.id))
    app.save(sleep)
  } catch (e) {}
  try {
    const weight = app.findCollectionByNameOrId("weight_entries")
    weight.fields = weight.fields.filter(f => !["select_weight_source", "text_weight_external_id", "number_weight_body_fat"].includes(f.id))
    app.save(weight)
  } catch (e) {}
})
