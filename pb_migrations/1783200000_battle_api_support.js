/// <reference path="../pb_data/types.d.ts" />

/**
 * Support schema for the server-authoritative battle API (issue #356).
 *
 * The #355 contract left two things to this issue:
 *
 * 1. **Idempotency.** The spec described "repeated requests with the same
 *    idempotency key are no-ops that return the accepted revision" in prose, but
 *    no field existed to record a key. `battle_mutations` is that ledger: the
 *    unique `(battle, key)` index is what actually makes a double-tap a no-op.
 *    The API inserts the row *inside* the same transaction as the mutation, so a
 *    unique-index violation is the signal that the mutation already ran — and the
 *    stored `response` is replayed verbatim instead of re-running the transition.
 *    Like `battle_invites`, the collection is completely API-inaccessible.
 *
 * 2. **Lobby expiry.** `battles` had no field to measure staleness against
 *    (`updated` moves on every unrelated write). `last_activity_at` is set by the
 *    API on each accepted lobby mutation, and both the expiry cron and the lazy
 *    check on snapshot reads compare against it.
 */
migrate((app) => {
  const battles = app.findCollectionByNameOrId('battles')

  // Bug fix for the #355 contract: `revision` was created `required: true`, and a
  // PocketBase number field treats 0 as blank — so the createRule's own
  // `@request.body.revision = 0` requirement could never be satisfied and *no battle
  // could be created at all* ("revision: Cannot be blank"). Nothing shipped on top of
  // it yet, so nobody hit it in production. Mutated in place so the field keeps its
  // id: replacing the field object would drop the column's data.
  const revision = (battles.fields || []).find(f => f.name === 'revision')
  if (revision) revision.required = false

  // Explicit field id, per the repo convention: a later type change must be able
  // to preserve it or PocketBase drops the column's data.
  const alreadyAdded = (battles.fields || []).some(f => f.name === 'last_activity_at')
  if (!alreadyAdded) {
    battles.fields.push(new Field({
      hidden: false,
      id: 'date_battle_last_activity',
      name: 'last_activity_at',
      presentable: false,
      required: false,
      system: false,
      type: 'date',
    }))
  }

  // Expiry sweeps scan by (status, last_activity_at); without this they table-scan.
  const expiryIndex = 'CREATE INDEX idx_battles_status_activity ON battles (status, last_activity_at)'
  const indexes = (battles.indexes || []).slice()
  if (!indexes.some(idx => idx.includes('idx_battles_status_activity'))) {
    indexes.push(expiryIndex)
    battles.indexes = indexes
  }
  app.save(battles)

  let mutations
  try {
    mutations = app.findCollectionByNameOrId('battle_mutations')
  } catch {
    mutations = new Collection({
      name: 'battle_mutations',
      type: 'base',
      fields: [
        { name: 'battle', type: 'relation', required: true, collectionId: battles.id, maxSelect: 1, cascadeDelete: true },
        { name: 'user', type: 'relation', required: false, collectionId: '_pb_users_auth_', maxSelect: 1 },
        // Deliberately not called `key`: it is a reserved word in enough SQL
        // contexts that a filter expression would have to quote it, and a
        // mis-quoted filter fails silently in the JSVM.
        { name: 'mutation_key', type: 'text', required: true },
        { name: 'endpoint', type: 'text', required: true },
        { name: 'response', type: 'json', required: false },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_battle_mutations_battle_key ON battle_mutations (battle, mutation_key)',
      ],
    })
  }

  // Never readable or writable through the collection API: this is server bookkeeping.
  mutations.listRule = null
  mutations.viewRule = null
  mutations.createRule = null
  mutations.updateRule = null
  mutations.deleteRule = null
  app.save(mutations)
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId('battle_mutations'))
  } catch { /* already gone */ }

  try {
    const battles = app.findCollectionByNameOrId('battles')
    const revision = (battles.fields || []).find(f => f.name === 'revision')
    if (revision) revision.required = true
    battles.fields = battles.fields.filter(f => f.id !== 'date_battle_last_activity')
    battles.indexes = (battles.indexes || []).filter(
      idx => !idx.includes('idx_battles_status_activity'),
    )
    app.save(battles)
  } catch { /* collection already gone */ }
})
