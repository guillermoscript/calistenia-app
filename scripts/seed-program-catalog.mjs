#!/usr/bin/env node
/**
 * Seed the persona catalog.
 *
 *   - Retags the existing "Intermedio – Balance Total" record with the new
 *     goal_type/intensity/etc. fields (idempotent).
 *   - Creates the 15 catalog programs as skeletons: 1 phase, 1 day, 1
 *     placeholder exercise (so ProgramDetailPage doesn't 404).
 *
 * Sigue siendo la vía por API, con superusuario. Para sembrar sin credenciales
 * está la migración `*_seed_official_programs.js` (#615), que trae el contenido
 * completo en vez de esqueletos.
 *
 * Idempotent: skips any program whose i18n-name already exists.
 *
 * Usage:
 *   node scripts/seed-program-catalog.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD>
 */

import { DEFAULT_PRIORITY, DEFAULT_SECTION } from './lib/program-exercise-fields.mjs'
import { SKELETONS } from './lib/program-catalog.mjs'

const PB_URL = process.argv[2]
const SU_EMAIL = process.argv[3]
const SU_PASSWORD = process.argv[4]

if (!PB_URL || !SU_EMAIL || !SU_PASSWORD) {
  console.error('Usage: node scripts/seed-program-catalog.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD>')
  process.exit(1)
}

const i18n = (es, en) => ({ es, en })

// Los 15 programas del catálogo viven en `lib/program-catalog.mjs`: los comparte
// con el generador de la migración de siembra (#615), que es lo que impide que
// una migración y este script siembren metadatos distintos.

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
      // Catálogo curado: público explícito (#603).
      visibility: "public",
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
        // Un stub de «contenido próximamente» no tiene prioridad real. Estas filas
        // las borra y recrea `update-program-content.mjs` en cuanto hay contenido.
        priority: DEFAULT_PRIORITY,
        is_timer: false,
        timer_seconds: 0,
        sort_order: 1,
        section: DEFAULT_SECTION,
      }),
    })
    console.log(`  ✓ ${sk.name.es} (${prog.id})`)
  }

  console.log('\n✅ Catalog seeded.')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
