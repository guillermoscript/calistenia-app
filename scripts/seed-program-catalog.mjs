#!/usr/bin/env node
/**
 * Seed the 13-program persona catalog.
 *
 *   - Retags the existing "Intermedio – Balance Total" record with the new
 *     goal_type/intensity/etc. fields (idempotent).
 *   - Creates the remaining 12 programs as skeletons: 1 phase, 1 day, 1
 *     placeholder exercise (so ProgramDetailPage doesn't 404).
 *
 * Idempotent: skips any program whose i18n-name already exists.
 *
 * Usage:
 *   node scripts/seed-program-catalog.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD>
 */

const PB_URL = process.argv[2]
const SU_EMAIL = process.argv[3]
const SU_PASSWORD = process.argv[4]

if (!PB_URL || !SU_EMAIL || !SU_PASSWORD) {
  console.error('Usage: node scripts/seed-program-catalog.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD>')
  process.exit(1)
}

const i18n = (es, en) => ({ es, en })

// 12 programs to CREATE (Balance Total is retagged, not created).
const SKELETONS = [
  // level × goal (8 — Balance Total handles intermediate+maintain)
  { slug: 'principiante-quema-grasa', name: i18n('Principiante · Quema Grasa', 'Beginner · Fat Burn'),
    description: i18n('Rutina suave 4 días/sem para bajar grasa sin perder músculo. Enfocado en movimientos base.', '4-day/week gentle routine to burn fat without losing muscle. Focused on fundamentals.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'fat_loss', intensity: 'light', days_per_week: 4, equipment_required: [], contraindications: [] },
  { slug: 'principiante-ganar-musculo', name: i18n('Principiante · Ganar Músculo', 'Beginner · Muscle Gain'),
    description: i18n('Hipertrofia base 4 días/sem para principiantes. Progresión simple hacia primer pull-up y dip.', 'Beginner hypertrophy 4 days/week. Simple progression toward first pull-up and dip.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'muscle_gain', intensity: 'moderate', days_per_week: 4, equipment_required: ['pull_bar'], contraindications: [] },
  { slug: 'principiante-fundamentos', name: i18n('Principiante · Fundamentos', 'Beginner · Fundamentals'),
    description: i18n('Tu primer programa de calistenia. 3 días/sem, técnica y hábito.', 'Your first calisthenics program. 3 days/week, technique and consistency.'),
    duration_weeks: 8, difficulty: 'beginner', goal_type: 'maintain', intensity: 'light', days_per_week: 3, equipment_required: [], contraindications: [] },
  { slug: 'intermedio-definicion', name: i18n('Intermedio · Definición', 'Intermediate · Cutting'),
    description: i18n('5 días/sem alta intensidad. Para bajar % graso conservando masa magra.', '5 days/week high intensity. Cut body fat while preserving lean mass.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'fat_loss', intensity: 'intense', days_per_week: 5, equipment_required: ['pull_bar','parallel_bars'], contraindications: [] },
  { slug: 'intermedio-hipertrofia', name: i18n('Intermedio · Hipertrofia', 'Intermediate · Hypertrophy'),
    description: i18n('Ganancia muscular 5 días/sem. Variaciones con más rango y pausa.', 'Muscle gain 5 days/week. Paused variations with extended range of motion.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'muscle_gain', intensity: 'moderate', days_per_week: 5, equipment_required: ['pull_bar','parallel_bars'], contraindications: [] },
  { slug: 'avanzado-cutting', name: i18n('Avanzado · Cutting Élite', 'Advanced · Elite Cutting'),
    description: i18n('Programa intenso 5 días/sem: cardio + alta frecuencia. Para atletas avanzados.', 'Intense 5 days/week program: cardio plus high-frequency strength. For advanced athletes.'),
    duration_weeks: 12, difficulty: 'advanced', goal_type: 'fat_loss', intensity: 'intense', days_per_week: 5, equipment_required: ['pull_bar','parallel_bars','bands'], contraindications: [] },
  { slug: 'avanzado-volumen', name: i18n('Avanzado · Volumen Máximo', 'Advanced · Max Volume'),
    description: i18n('6 días/sem. Hipertrofia de alta frecuencia con movimientos avanzados (planche, front lever progresiones).', '6 days/week. High-frequency hypertrophy with advanced movements (planche, front-lever progressions).'),
    duration_weeks: 12, difficulty: 'advanced', goal_type: 'muscle_gain', intensity: 'intense', days_per_week: 6, equipment_required: ['pull_bar','parallel_bars','bands'], contraindications: [] },
  { slug: 'avanzado-fuerza-total', name: i18n('Avanzado · Fuerza Total', 'Advanced · Total Strength'),
    description: i18n('6 días/sem para mantener niveles altos de fuerza calisténica. Skills + básicos pesados.', '6 days/week to maintain high calisthenics strength. Skills plus heavy basics.'),
    duration_weeks: 12, difficulty: 'advanced', goal_type: 'maintain', intensity: 'intense', days_per_week: 6, equipment_required: ['pull_bar','parallel_bars','bands'], contraindications: [] },
  // skill tracks (4)
  { slug: 'pull-up-roadmap', name: i18n('Pull-up Roadmap', 'Pull-up Roadmap'),
    description: i18n('De cero a tu primera dominada estricta. 3 días/sem con progresiones y ligas.', 'From zero to your first strict pull-up. 3 days/week with progressions and bands.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'skill', skill: 'pull_up', intensity: 'light', days_per_week: 3, equipment_required: ['pull_bar','bands'], contraindications: [] },
  { slug: 'handstand-roadmap', name: i18n('Handstand Roadmap', 'Handstand Roadmap'),
    description: i18n('Pino libre desde cero. Pared, equilibrio y progresión diaria.', 'Freestanding handstand from zero. Wall, balance, and daily progression.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'skill', skill: 'handstand', intensity: 'moderate', days_per_week: 3, equipment_required: [], contraindications: ['wrist','shoulder'] },
  { slug: 'muscle-up-roadmap', name: i18n('Muscle-up Roadmap', 'Muscle-up Roadmap'),
    description: i18n('Tu primer muscle up. Requiere pull-ups estrictos y dips profundos.', 'Your first muscle-up. Requires strict pull-ups and deep dips.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'skill', skill: 'muscle_up', intensity: 'intense', days_per_week: 4, equipment_required: ['pull_bar'], contraindications: ['elbow','shoulder'] },
  { slug: 'planche-roadmap', name: i18n('Planche Roadmap', 'Planche Roadmap'),
    description: i18n('Progresión hacia planche. Tuck → straddle → full. Requiere base avanzada.', 'Planche progression. Tuck → straddle → full. Requires advanced baseline.'),
    duration_weeks: 16, difficulty: 'advanced', goal_type: 'skill', skill: 'planche', intensity: 'intense', days_per_week: 4, equipment_required: ['parallel_bars'], contraindications: ['wrist','shoulder','elbow'] },
]

async function api(path, opts = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${path}: ${body}`)
  }
  return res.json()
}

async function main() {
  console.log('🔑 Authenticating as superuser...')
  const auth = await api('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: SU_EMAIL, password: SU_PASSWORD }),
  })
  const authH = { Authorization: `Bearer ${auth.token}` }
  console.log('  ✓ Authenticated')

  // 1. Retag existing Balance Total.
  console.log('🏷  Retagging Intermedio – Balance Total...')
  const existing = await api('/api/collections/programs/records?perPage=200', { headers: authH })
  const balanceTotal = existing.items.find(p => {
    const n = typeof p.name === 'object' ? (p.name.es || '') : (p.name || '')
    return n.includes('Balance Total')
  })
  if (balanceTotal) {
    await api(`/api/collections/programs/records/${balanceTotal.id}`, {
      method: 'PATCH', headers: authH,
      body: JSON.stringify({
        goal_type: 'maintain',
        intensity: 'moderate',
        days_per_week: 6,
        equipment_required: ['pull_bar','parallel_bars','bands'],
        contraindications: ['abdominal_hernia','lower_back'],
      }),
    })
    console.log(`  ✓ Balance Total retagged (${balanceTotal.id})`)
  } else {
    console.log('  ⚠ Balance Total not found — skipping retag')
  }

  // 2. Create the 12 skeletons.
  const existingNames = new Set(existing.items.map(p => (typeof p.name === 'object' ? p.name.es : p.name) || ''))
  for (const sk of SKELETONS) {
    if (existingNames.has(sk.name.es)) {
      console.log(`  ⚠ "${sk.name.es}" exists — skipping`)
      continue
    }
    console.log(`📋 Creating: ${sk.name.es}`)
    const body = {
      name: sk.name,
      description: sk.description,
      duration_weeks: sk.duration_weeks,
      difficulty: sk.difficulty,
      goal_type: sk.goal_type,
      intensity: sk.intensity,
      days_per_week: sk.days_per_week,
      equipment_required: sk.equipment_required,
      contraindications: sk.contraindications,
      is_active: true,
      is_official: true,
      is_featured: false,
    }
    if (sk.skill) body.skill = sk.skill
    const prog = await api('/api/collections/programs/records', {
      method: 'POST', headers: authH, body: JSON.stringify(body),
    })

    // Stub phase
    await api('/api/collections/program_phases/records', {
      method: 'POST', headers: authH,
      body: JSON.stringify({
        program: prog.id,
        phase_number: 1,
        name: i18n('Fase 1', 'Phase 1'),
        weeks: `1-${sk.duration_weeks}`,
        color: '#6B7280',
        sort_order: 1,
      }),
    })

    // Stub exercise (so program detail doesn't render blank)
    await api('/api/collections/program_exercises/records', {
      method: 'POST', headers: authH,
      body: JSON.stringify({
        program: prog.id,
        phase_number: 1,
        day_id: 'lun',
        day_name: i18n('Lunes', 'Monday'),
        day_focus: i18n('Próximamente', 'Coming soon'),
        workout_title: i18n('Contenido en desarrollo', 'Content in development'),
        exercise_id: `${sk.slug}_stub_1`,
        exercise_name: i18n('Contenido próximamente', 'Content coming soon'),
        sets: 0,
        reps: '',
        rest_seconds: 0,
        muscles: i18n('', ''),
        note: i18n('El plan completo estará disponible muy pronto.', 'The full plan will be available soon.'),
        youtube: '',
        priority: 'primary',
        is_timer: false,
        timer_seconds: 0,
        sort_order: 1,
      }),
    })
    console.log(`  ✓ ${sk.name.es} (${prog.id})`)
  }

  console.log('\n✅ Catalog seeded.')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
