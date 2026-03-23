/// <reference path="../pb_data/types.d.ts" />
/**
 * Security fix: program phases/exercises auth bypass + programs createRule.
 *
 * C2: program_phases and program_exercises used @collection.programs.id ?= program
 *     which matches across DIFFERENT records — any user who owns ANY program could
 *     modify ALL programs' phases/exercises. Fix: use relation expansion
 *     program.created_by = @request.auth.id instead.
 *
 * C4: programs createRule was just '@request.auth.id != ""', missing the check
 *     that the caller is setting created_by to themselves.
 */

migrate((app) => {
  // ── programs ────────────────────────────────────────────────────────────
  const programs = app.findCollectionByNameOrId("pbc_2970041692")
  programs.createRule = '@request.auth.id != "" && @request.body.created_by = @request.auth.id'
  app.save(programs)

  // ── program_phases ──────────────────────────────────────────────────────
  const phases = app.findCollectionByNameOrId("pbc_1688347176")
  phases.createRule = '@request.auth.id != "" && (program.created_by = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "editor")'
  phases.updateRule = '@request.auth.id != "" && (program.created_by = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "editor")'
  phases.deleteRule = '@request.auth.id != "" && (program.created_by = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "editor")'
  app.save(phases)

  // ── program_exercises ───────────────────────────────────────────────────
  const exercises = app.findCollectionByNameOrId("pbc_3294601311")
  exercises.createRule = '@request.auth.id != "" && (program.created_by = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "editor")'
  exercises.updateRule = '@request.auth.id != "" && (program.created_by = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "editor")'
  exercises.deleteRule = '@request.auth.id != "" && (program.created_by = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "editor")'
  app.save(exercises)

}, (app) => {
  // Rollback: restore previous (vulnerable) rules
  const programs = app.findCollectionByNameOrId("pbc_2970041692")
  programs.createRule = '@request.auth.id != ""'
  app.save(programs)

  const phases = app.findCollectionByNameOrId("pbc_1688347176")
  phases.createRule = '@request.auth.id != "" && @collection.programs.id ?= program && @collection.programs.created_by ?= @request.auth.id'
  phases.updateRule = '@request.auth.id != "" && @collection.programs.id ?= program && @collection.programs.created_by ?= @request.auth.id'
  phases.deleteRule = '@request.auth.id != "" && @collection.programs.id ?= program && @collection.programs.created_by ?= @request.auth.id'
  app.save(phases)

  const exercises = app.findCollectionByNameOrId("pbc_3294601311")
  exercises.createRule = '@request.auth.id != "" && @collection.programs.id ?= program && @collection.programs.created_by ?= @request.auth.id'
  exercises.updateRule = '@request.auth.id != "" && @collection.programs.id ?= program && @collection.programs.created_by ?= @request.auth.id'
  exercises.deleteRule = '@request.auth.id != "" && @collection.programs.id ?= program && @collection.programs.created_by ?= @request.auth.id'
  app.save(exercises)
})
