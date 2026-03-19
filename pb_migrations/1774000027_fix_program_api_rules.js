/// <reference path="../pb_data/types.d.ts" />
/**
 * Fix API rules for program creation flow.
 *
 * Problem: programs, program_phases, and program_exercises all had
 * createRule/deleteRule/updateRule set to null (superusers only).
 * Regular authenticated users could not create programs.
 *
 * Fix: Allow authenticated users to create/update/delete their own
 * programs and the related phases/exercises. Scoped so users can only
 * modify records belonging to programs they own (created_by = auth.id).
 */

migrate((app) => {
  // ── programs ────────────────────────────────────────────────────────────
  const programs = app.findCollectionByNameOrId("pbc_2970041692")
  programs.createRule = '@request.auth.id != ""'
  programs.deleteRule = 'created_by = @request.auth.id'
  // updateRule was already set in migration 1774000013, but let's ensure it
  programs.updateRule = '@request.auth.id != "" && (created_by = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "editor")'
  app.save(programs)

  // ── program_phases ──────────────────────────────────────────────────────
  // Users can create/update/delete phases of programs they own.
  // The rule checks via the relation: program.created_by = auth.id
  const phases = app.findCollectionByNameOrId("pbc_1688347176")
  phases.createRule = '@request.auth.id != "" && @collection.programs.id ?= program && @collection.programs.created_by ?= @request.auth.id'
  phases.updateRule = '@request.auth.id != "" && @collection.programs.id ?= program && @collection.programs.created_by ?= @request.auth.id'
  phases.deleteRule = '@request.auth.id != "" && @collection.programs.id ?= program && @collection.programs.created_by ?= @request.auth.id'
  app.save(phases)

  // ── program_exercises ───────────────────────────────────────────────────
  const exercises = app.findCollectionByNameOrId("pbc_3294601311")
  exercises.createRule = '@request.auth.id != "" && @collection.programs.id ?= program && @collection.programs.created_by ?= @request.auth.id'
  exercises.updateRule = '@request.auth.id != "" && @collection.programs.id ?= program && @collection.programs.created_by ?= @request.auth.id'
  exercises.deleteRule = '@request.auth.id != "" && @collection.programs.id ?= program && @collection.programs.created_by ?= @request.auth.id'
  app.save(exercises)

}, (app) => {
  // Rollback: restore superuser-only rules
  const programs = app.findCollectionByNameOrId("pbc_2970041692")
  programs.createRule = null
  programs.deleteRule = null
  app.save(programs)

  const phases = app.findCollectionByNameOrId("pbc_1688347176")
  phases.createRule = null
  phases.updateRule = null
  phases.deleteRule = null
  app.save(phases)

  const exercises = app.findCollectionByNameOrId("pbc_3294601311")
  exercises.createRule = null
  exercises.updateRule = null
  exercises.deleteRule = null
  app.save(exercises)
})
