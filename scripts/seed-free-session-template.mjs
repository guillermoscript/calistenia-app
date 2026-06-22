/**
 * Quick seed: free_session_templates for the local test-b account, so the
 * "Sesión libre → Plantillas guardadas" list + one-tap relaunch can be tested
 * end to end without first completing a session.
 *
 *   node scripts/seed-free-session-template.mjs
 *
 * Each run appends two templates (delete via PB admin if they pile up).
 */
const PB = process.env.PB_URL || 'http://127.0.0.1:8090'
const IDENTITY = process.env.SEED_USER || 'test-b@local.test'
const PASSWORD = process.env.SEED_PASS || 'TestUser123!'

async function api(path, opts = {}, token) {
  const res = await fetch(`${PB}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
      ...(opts.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${res.status} ${path}: ${JSON.stringify(body).slice(0, 300)}`)
  return body
}

const ex = (id, name, muscles, sets, reps, rest) => ({
  id, name, sets, reps, rest, muscles,
  note: '', youtube: '', priority: 'med', section: 'main',
})

const TEMPLATES = [
  {
    title: 'Dominadas, Fondos +2',
    exercises: [
      ex('pull_ups', 'Dominadas', 'Espalda, Bíceps', 4, '6-10', 120),
      ex('dips', 'Fondos en paralelas', 'Pecho, Tríceps', 4, '8-12', 120),
      ex('pike_push_ups', 'Flexiones pike', 'Hombros', 3, '8-12', 90),
      ex('hanging_leg_raises', 'Elevaciones de piernas colgado', 'Core', 3, '10-15', 90),
    ],
  },
  {
    title: 'Pierna rápida',
    exercises: [
      ex('pistol_squats', 'Sentadilla pistol', 'Cuádriceps, Glúteos', 4, '5-8', 120),
      ex('nordic_curls', 'Curl nórdico', 'Isquiotibiales', 3, '6-10', 120),
      ex('calf_raises', 'Elevación de gemelos', 'Gemelos', 4, '15-20', 60),
    ],
  },
]

async function main() {
  console.log(`→ Auth ${IDENTITY} @ ${PB}`)
  const auth = await api('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: IDENTITY, password: PASSWORD }),
  })
  const token = auth.token
  const uid = auth.record.id
  console.log(`  user id = ${uid}`)

  for (const tpl of TEMPLATES) {
    const rec = await api('/api/collections/free_session_templates/records', {
      method: 'POST',
      body: JSON.stringify({
        user: uid,
        title: tpl.title,
        exercises: tpl.exercises,
        usage_count: 0,
        last_used_at: new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z',
      }),
    }, token)
    console.log(`  ✓ ${tpl.title} (${rec.id}) — ${tpl.exercises.length} ejercicios`)
  }
  console.log('Done.')
}

main().catch(e => { console.error('SEED FAILED:', e.message); process.exit(1) })
