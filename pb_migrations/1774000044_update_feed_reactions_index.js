/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("feed_reactions")

  // Remove old unique index and add new one with emoji
  collection.indexes = [
    "CREATE UNIQUE INDEX idx_reaction_unique ON feed_reactions (session_id, reactor, emoji)",
    "CREATE INDEX idx_reaction_session ON feed_reactions (session_id)"
  ]

  // Disable update rule - reactions are toggled via create/delete only
  collection.updateRule = null

  app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("feed_reactions")
  collection.indexes = [
    "CREATE UNIQUE INDEX idx_reaction_unique ON feed_reactions (session_id, reactor)",
    "CREATE INDEX idx_reaction_session ON feed_reactions (session_id)"
  ]
  collection.updateRule = "reactor = @request.auth.id"
  app.save(collection)
})
