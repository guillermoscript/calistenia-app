/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("notifications")

  // PB 0.36 base collections don't include created/updated by default
  if (!collection.fields.getByName("created")) {
    collection.fields.add(new AutodateField({
      name: "created",
      onCreate: true,
      onUpdate: false,
    }))
  }

  if (!collection.fields.getByName("updated")) {
    collection.fields.add(new AutodateField({
      name: "updated",
      onCreate: true,
      onUpdate: true,
    }))
  }

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("notifications")
  const created = collection.fields.getByName("created")
  if (created) collection.fields.removeById(created.id)
  const updated = collection.fields.getByName("updated")
  if (updated) collection.fields.removeById(updated.id)
  app.save(collection)
})
