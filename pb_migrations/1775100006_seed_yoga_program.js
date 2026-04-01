/// <reference path="../pb_data/types.d.ts" />

/**
 * Seed: "Ashtanga Yoga — Principiante"
 *
 * Phase 1 (4 wks): Surya Namaskar + standing poses, 3 days/week (L/M/V)
 * Phase 2 (4 wks): + seated poses through Navasana, 4 days/week (L/M/J/S)
 * Phase 3 (4 wks): Half primary series, 4 days/week (L/M/J/S)
 * Phase 4 (12 wks): Full primary series, 5 days/week (L-V)
 */
migrate((app) => {
  const PROGRAM_NAME = { es: "Ashtanga Yoga — Principiante" }
  const PROGRAM_DESC = { es: "Programa progresivo de Ashtanga Yoga. Desde los Saludos al Sol hasta la Serie Primaria completa en 24 semanas." }

  // Idempotency: check if program already exists
  try {
    const existing = app.findFirstRecordByFilter("programs", `name ~ 'Ashtanga Yoga'`)
    if (existing) return
  } catch (e) {
    // Not found, proceed
  }

  // ── Helper: create a record and return it ──
  function createRecord(collectionName, data) {
    const col = app.findCollectionByNameOrId(collectionName)
    const rec = new Record(col)
    for (const [k, v] of Object.entries(data)) {
      // JSON fields need explicit serialization for PB's JS runtime
      rec.set(k, typeof v === "object" && v !== null ? JSON.stringify(v) : v)
    }
    app.save(rec)
    return rec
  }

  // ── 1. Create program ──
  const program = createRecord("programs", {
    name: PROGRAM_NAME,
    description: PROGRAM_DESC,
    duration_weeks: 24,
    is_active: true,
  })
  const progId = program.id

  // ── Pose slugs by group (for exercise_id references) ──
  const WARMUP = ["ujjayi-pranayama", "surya-namaskar-a", "surya-namaskar-b"]

  const STANDING = [
    "padangusthasana", "padahastasana",
    "utthita-trikonasana", "parivrtta-trikonasana",
    "utthita-parsvakonasana", "parivrtta-parsvakonasana",
    "prasarita-padottanasana-a", "prasarita-padottanasana-b",
    "prasarita-padottanasana-c", "prasarita-padottanasana-d",
    "parsvottanasana",
    "utthita-hasta-padangusthasana",
    "ardha-baddha-padmottanasana",
    "utkatasana",
    "virabhadrasana-a", "virabhadrasana-b",
  ]

  const SEATED_THROUGH_NAVASANA = [
    "dandasana",
    "paschimottanasana-a", "paschimottanasana-b", "paschimottanasana-c",
    "purvottanasana",
    "ardha-baddha-padma-paschimottanasana",
    "triang-mukhaikapada-paschimottanasana",
    "janu-sirsasana-a", "janu-sirsasana-b", "janu-sirsasana-c",
    "marichyasana-a", "marichyasana-b", "marichyasana-c", "marichyasana-d",
    "navasana",
  ]

  const SEATED_AFTER_NAVASANA = [
    "bhujapidasana", "kurmasana", "supta-kurmasana",
    "garbha-pindasana", "kukkutasana",
    "baddha-konasana", "upavishta-konasana",
    "supta-konasana", "supta-padangusthasana",
    "ubhaya-padangusthasana", "urdhva-mukha-paschimottanasana",
    "setu-bandhasana",
  ]

  const FINISHING = [
    "urdhva-dhanurasana",
    "salamba-sarvangasana", "halasana", "karnapidasana",
    "urdhva-padmasana", "pindasana",
    "matsyasana", "uttana-padasana",
    "sirsasana",
  ]

  const COOLDOWN = [
    "baddha-padmasana", "yoga-mudra",
    "padmasana-closing", "utplutih",
    "savasana",
  ]

  // ── Pose catalog lookup cache ──
  const poseCache = {}
  function getPose(slug) {
    if (poseCache[slug]) return poseCache[slug]
    try {
      const rec = app.findFirstRecordByFilter("exercises_catalog", `slug = '${slug}'`)
      poseCache[slug] = rec
      return rec
    } catch (e) {
      return null
    }
  }

  // ── Build exercise entries for a day from slug list ──
  function buildExercises(slugs, dayId, phaseNum) {
    const exercises = []
    let sortOrder = 1
    for (const slug of slugs) {
      const pose = getPose(slug)
      if (!pose) continue

      const section = WARMUP.includes(slug)
        ? "warmup"
        : COOLDOWN.includes(slug)
          ? "cooldown"
          : "main"

      exercises.push({
        program: progId,
        phase_number: phaseNum,
        day_id: dayId,
        day_name: { es: DAY_NAMES[dayId] },
        day_type: "yoga",
        day_focus: { es: "Ashtanga Yoga" },
        day_color: "#7C3AED",
        workout_title: { es: "Ashtanga Yoga" },
        exercise_id: `${dayId}_${phaseNum}_${sortOrder}`,
        exercise_name: { es: pose.get("name") },
        sets: pose.get("default_sets") || 1,
        reps: pose.get("default_reps") || "1",
        rest_seconds: pose.get("default_rest_seconds") || 0,
        muscles: { es: pose.get("muscles") || "" },
        note: { es: pose.get("note") || "" },
        priority: "primary",
        is_timer: pose.get("is_timer") || false,
        timer_seconds: pose.get("default_timer_seconds") || 0,
        sort_order: sortOrder,
        section: section,
      })
      sortOrder++
    }
    return exercises
  }

  // ── Day name mapping ──
  const DAY_NAMES = {
    lun: "Lunes", mar: "Martes", mie: "Miércoles",
    jue: "Jueves", vie: "Viernes", sab: "Sábado", dom: "Domingo",
  }

  // ── Phase definitions ──
  const phases = [
    {
      phase_number: 1,
      name: { es: "Fundamentos" },
      weeks: "1-4",
      color: "#7C3AED",
      bg_color: "rgba(124,58,237,0.08)",
      // L/M/V = yoga, rest the rest
      activeDays: ["lun", "mie", "vie"],
      slugs: [...WARMUP, ...STANDING, ...COOLDOWN],
    },
    {
      phase_number: 2,
      name: { es: "Construcción" },
      weeks: "5-8",
      color: "#8B5CF6",
      bg_color: "rgba(139,92,246,0.08)",
      // L/M/J/S
      activeDays: ["lun", "mie", "jue", "sab"],
      slugs: [...WARMUP, ...STANDING, ...SEATED_THROUGH_NAVASANA, ...COOLDOWN],
    },
    {
      phase_number: 3,
      name: { es: "Media Serie Primaria" },
      weeks: "9-12",
      color: "#A78BFA",
      bg_color: "rgba(167,139,250,0.08)",
      // L/M/J/S
      activeDays: ["lun", "mie", "jue", "sab"],
      slugs: [...WARMUP, ...STANDING, ...SEATED_THROUGH_NAVASANA, ...SEATED_AFTER_NAVASANA, ...COOLDOWN],
    },
    {
      phase_number: 4,
      name: { es: "Serie Primaria Completa" },
      weeks: "13-24",
      color: "#C4B5FD",
      bg_color: "rgba(196,181,253,0.08)",
      // L-V (5 days)
      activeDays: ["lun", "mar", "mie", "jue", "vie"],
      slugs: [...WARMUP, ...STANDING, ...SEATED_THROUGH_NAVASANA, ...SEATED_AFTER_NAVASANA, ...FINISHING, ...COOLDOWN],
    },
  ]

  const ALL_DAYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"]

  for (const phase of phases) {
    // ── Create phase record ──
    createRecord("program_phases", {
      program: progId,
      phase_number: phase.phase_number,
      name: phase.name,
      weeks: phase.weeks,
      color: phase.color,
      bg_color: phase.bg_color,
      sort_order: phase.phase_number,
    })

    // ── Create day configs + exercises ──
    let daySortOrder = 1
    for (const dayId of ALL_DAYS) {
      const isActive = phase.activeDays.includes(dayId)
      const dayType = isActive ? "yoga" : "rest"

      // Day config
      createRecord("program_day_config", {
        program: progId,
        phase_number: phase.phase_number,
        day_id: dayId,
        day_name: { es: DAY_NAMES[dayId] },
        day_type: dayType,
        day_focus: { es: isActive ? "Ashtanga Yoga" : "Descanso" },
        day_color: isActive ? "#7C3AED" : "#6B7280",
        sort_order: daySortOrder,
      })
      daySortOrder++

      // Exercises (only for active days)
      if (isActive) {
        const exercises = buildExercises(phase.slugs, dayId, phase.phase_number)
        for (const ex of exercises) {
          createRecord("program_exercises", ex)
        }
      }
    }
  }
}, (app) => {
  // Down: remove the yoga program and all related records (cascade delete handles phases/exercises/day_config)
  try {
    const program = app.findFirstRecordByFilter("programs", `name ~ 'Ashtanga Yoga'`)
    if (program) {
      // Delete day configs manually (no cascade from program)
      try {
        const dayConfigs = app.findRecordsByFilter("program_day_config", `program = '${program.id}'`)
        for (const dc of dayConfigs) {
          app.delete(dc)
        }
      } catch (e) { /* no configs */ }

      app.delete(program) // cascade deletes phases + exercises
    }
  } catch (e) {
    // Program not found, nothing to undo
  }
})
