/// <reference path="../pb_data/types.d.ts" />

/**
 * Collaborative circuit battle contract.
 *
 * Battles are separate from races: races are GPS/cardio competitions, while
 * battles are workout circuits with server-owned progress and scoring.
 * All lifecycle, progress, score and invite mutations are server-only. The
 * future battle API will authenticate the caller, validate the transition,
 * write server timestamps and increment revision atomically, then PocketBase
 * realtime will fan the new snapshot out to authorized readers.
 */
migrate((app) => {
  let battles
  try {
    battles = app.findCollectionByNameOrId('battles')
  } catch {
    battles = new Collection({
      name: 'battles',
      type: 'base',
      fields: [
        { name: 'creator', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'status', type: 'text', required: true },
        { name: 'config', type: 'json', required: true },
        { name: 'revision', type: 'number', required: true },
        { name: 'invite_expires_at', type: 'date' },
        { name: 'invite_revoked_at', type: 'date' },
        { name: 'starts_at', type: 'date' },
        { name: 'ends_at', type: 'date' },
        { name: 'finished_at', type: 'date' },
      ],
      indexes: [
        'CREATE INDEX idx_battles_creator_status ON battles (creator, status)',
        'CREATE INDEX idx_battles_status_revision ON battles (status, revision)',
      ],
    })
  }

  // The participant back-relation does not exist until the second collection
  // is saved. Apply the participant-aware read rules after that save below.
  battles.listRule = 'creator = @request.auth.id'
  battles.viewRule = 'creator = @request.auth.id'
  battles.createRule = '@request.auth.id = creator && @request.body.status = "draft" && @request.body.revision = 0'
  battles.updateRule = null
  battles.deleteRule = null
  app.save(battles)

  let participants
  try {
    participants = app.findCollectionByNameOrId('battle_participants')
  } catch {
    participants = new Collection({
      name: 'battle_participants',
      type: 'base',
      fields: [
        { name: 'battle', type: 'relation', required: true, collectionId: battles.id, maxSelect: 1, cascadeDelete: true },
        { name: 'user', type: 'relation', required: false, collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'status', type: 'text', required: true },
        { name: 'progress', type: 'json', required: true },
        { name: 'joined_at', type: 'date' },
        { name: 'ready_at', type: 'date' },
        { name: 'active_at', type: 'date' },
        { name: 'finished_at', type: 'date' },
        { name: 'left_at', type: 'date' },
        { name: 'last_seen_at', type: 'date' },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_battle_participants_battle_user ON battle_participants (battle, "user")',
        'CREATE INDEX idx_battle_participants_battle_status ON battle_participants (battle, status)',
      ],
    })
  }

  participants.listRule = 'user = @request.auth.id || battle.creator = @request.auth.id'
  participants.viewRule = 'user = @request.auth.id || battle.creator = @request.auth.id'
  participants.createRule = null
  participants.updateRule = null
  participants.deleteRule = null
  app.save(participants)

  battles.listRule = 'creator = @request.auth.id || battle_participants_via_battle.user ?= @request.auth.id'
  battles.viewRule = 'creator = @request.auth.id || battle_participants_via_battle.user ?= @request.auth.id'
  app.save(battles)

  let invites
  try {
    invites = app.findCollectionByNameOrId('battle_invites')
  } catch {
    invites = new Collection({
      name: 'battle_invites',
      type: 'base',
      fields: [
        { name: 'battle', type: 'relation', required: true, collectionId: battles.id, maxSelect: 1, cascadeDelete: true },
        { name: 'created_by', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'invitee_user', type: 'relation', required: false, collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'token_hash', type: 'text', required: true },
        { name: 'status', type: 'text', required: true },
        { name: 'expires_at', type: 'date', required: true },
        { name: 'used_at', type: 'date' },
        { name: 'used_by', type: 'relation', required: false, collectionId: '_pb_users_auth_', maxSelect: 1 },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_battle_invites_token_hash ON battle_invites (token_hash)',
        'CREATE INDEX idx_battle_invites_battle_status ON battle_invites (battle, status)',
      ],
    })
  }

  // Raw invite tokens only live in links. Their hashes stay server-only.
  invites.listRule = null
  invites.viewRule = null
  invites.createRule = null
  invites.updateRule = null
  invites.deleteRule = null
  app.save(invites)
}, (app) => {
  for (const name of ['battle_invites', 'battle_participants', 'battles']) {
    try { app.delete(app.findCollectionByNameOrId(name)) } catch {}
  }
})
