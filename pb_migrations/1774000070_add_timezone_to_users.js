/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")

  users.fields.add(new Field({
    type: "text",
    name: "timezone",
    required: false,
    system: false,
  }))

  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")

  users.fields.removeByName("timezone")

  app.save(users)
})
