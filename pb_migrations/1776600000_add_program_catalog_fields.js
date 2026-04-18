/// <reference path="../pb_data/types.d.ts" />

/**
 * Add catalog-matching fields to the programs collection.
 *
 * Supports the FOR YOU / TAMBIÉN PARA TI matching in StepProgram.tsx
 * (see docs/superpowers/specs/2026-04-18-programs-catalog-personas-design.md).
 *
 * Fields:
 *   - goal_type: fat_loss | muscle_gain | maintain | skill
 *   - skill: pull_up | handstand | muscle_up | planche (nullable)
 *   - intensity: light | moderate | intense
 *   - days_per_week: 1..7
 *   - equipment_required: string[] (json)
 *   - contraindications: string[] of INJURY_IDS ∪ CONDITION_IDS (json)
 *
 * All optional so existing records keep working. Up step also backfills
 * the existing "Intermedio – Balance Total" record.
 */
migrate((app) => {
  const programs = app.findCollectionByNameOrId("programs")

  if (!programs.fields.find(f => f.name === "goal_type")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "select_program_goal_type",
      "maxSelect": 1,
      "name": "goal_type",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "select",
      "values": ["fat_loss", "muscle_gain", "maintain", "skill"]
    }))
  }

  if (!programs.fields.find(f => f.name === "skill")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "select_program_skill",
      "maxSelect": 1,
      "name": "skill",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "select",
      "values": ["pull_up", "handstand", "muscle_up", "planche"]
    }))
  }

  if (!programs.fields.find(f => f.name === "intensity")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "select_program_intensity",
      "maxSelect": 1,
      "name": "intensity",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "select",
      "values": ["light", "moderate", "intense"]
    }))
  }

  if (!programs.fields.find(f => f.name === "days_per_week")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "number_program_days_per_week",
      "max": 7,
      "min": 1,
      "name": "days_per_week",
      "onlyInt": true,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }

  if (!programs.fields.find(f => f.name === "equipment_required")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "json_program_equipment_required",
      "maxSize": 1000,
      "name": "equipment_required",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    }))
  }

  if (!programs.fields.find(f => f.name === "contraindications")) {
    programs.fields.add(new Field({
      "hidden": false,
      "id": "json_program_contraindications",
      "maxSize": 1000,
      "name": "contraindications",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "json"
    }))
  }

  app.save(programs)

  // Backfill existing "Intermedio – Balance Total" record.
  // i18n-aware name match: `name` is stored as JSON { es: "...", en: "..." }.
  try {
    const existing = app.findRecordsByFilter(
      "programs",
      `name ~ "Balance Total" || name ~ "Intermedio"`,
      "",
      100,
      0
    )
    for (const rec of existing) {
      const nameEs = (rec.get("name") && rec.get("name").es) || ""
      if (!nameEs.includes("Balance Total")) continue
      rec.set("goal_type", "maintain")
      rec.set("intensity", "moderate")
      rec.set("days_per_week", 6)
      rec.set("equipment_required", ["pull_bar", "parallel_bars", "bands"])
      rec.set("contraindications", ["abdominal_hernia", "lower_back"])
      app.save(rec)
    }
  } catch (e) {
    // Fresh install with no Balance Total record yet — skip.
  }
}, (app) => {
  try {
    const programs = app.findCollectionByNameOrId("programs")
    const toRemove = [
      "select_program_goal_type",
      "select_program_skill",
      "select_program_intensity",
      "number_program_days_per_week",
      "json_program_equipment_required",
      "json_program_contraindications"
    ]
    programs.fields = programs.fields.filter(f => !toRemove.includes(f.id))
    app.save(programs)
  } catch (e) {}
})
