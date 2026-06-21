/**
 * Quick seed: body_measurements + body_photos + lumbar_checks for the local
 * test-b account, so the unified Calendar's new dots/chips (teal "medidas",
 * fuchsia "N fotos", emerald "lumbar X/5") render this month.
 *
 *   node scripts/seed-body-metrics-test.mjs
 *
 * Appends rows for the CURRENT month (uses today's year/month). Delete via PB
 * admin if you want a clean slate.
 */
const PB = process.env.PB_URL || 'http://127.0.0.1:8090'
const IDENTITY = process.env.SEED_USER || 'test-b@local.test'
const PASSWORD = process.env.SEED_PASS || 'TestUser123!'

const now = new Date()
const Y = now.getFullYear()
const M = now.getMonth() // 0-based
const pad = (n) => String(n).padStart(2, '0')
const day = (d) => `${Y}-${pad(M + 1)}-${pad(d)}`          // local YYYY-MM-DD (lumbar text)
const dayTs = (d) => `${day(d)} 10:00:00.000Z`             // PB `date` type value

async function api(path, opts = {}, token) {
  const res = await fetch(`${PB}${path}`, {
    ...opts,
    headers: {
      ...(opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: token } : {}),
      ...(opts.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${res.status} ${path}: ${JSON.stringify(body).slice(0, 300)}`)
  return body
}

// 1x1 transparent PNG so the required `photo` file field is satisfied.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

async function createPhoto(token, userId, d, category) {
  const fd = new FormData()
  fd.append('user', userId)
  fd.append('date', dayTs(d))
  fd.append('category', category)
  fd.append('photo', new Blob([PNG_1x1], { type: 'image/png' }), `progress-${category}-${d}.png`)
  return api('/api/collections/body_photos/records', { method: 'POST', body: fd }, token)
}

async function main() {
  console.log(`→ PB ${PB} as ${IDENTITY}; seeding ${Y}-${pad(M + 1)}`)
  const auth = await api('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: IDENTITY, password: PASSWORD }),
  })
  const token = auth.token
  const userId = auth.record.id
  console.log(`✓ auth ok, user ${userId}`)

  // body_measurements — days 5 & 18
  for (const [d, m] of [[5, { chest: 102, waist: 81, hips: 99, arm_left: 38, arm_right: 38.5, thigh_left: 58, thigh_right: 58 }],
                        [18, { chest: 102.5, waist: 80, hips: 99, arm_left: 38.5, arm_right: 39, thigh_left: 58.5, thigh_right: 58.5 }]]) {
    await api('/api/collections/body_measurements/records', {
      method: 'POST',
      body: JSON.stringify({ user: userId, date: dayTs(d), ...m, note: 'seed' }),
    }, token)
    console.log(`✓ measurement ${day(d)}`)
  }

  // lumbar_checks — days 3, 12, 20 (date is a TEXT field → plain YYYY-MM-DD)
  for (const [d, score, hrs] of [[3, 4, 6], [12, 3, 9], [20, 5, 4]]) {
    await api('/api/collections/lumbar_checks/records', {
      method: 'POST',
      body: JSON.stringify({ user: userId, date: day(d), lumbar_score: score, sitting_hours: hrs, slept_well: score >= 4, checked_at: dayTs(d) }),
    }, token)
    console.log(`✓ lumbar ${day(d)} score ${score}/5`)
  }

  // body_photos — day 12 (two, to test the count) + day 18
  await createPhoto(token, userId, 12, 'front')
  await createPhoto(token, userId, 12, 'back')
  await createPhoto(token, userId, 18, 'side')
  console.log(`✓ photos: 2 on ${day(12)}, 1 on ${day(18)}`)

  console.log('Done. Open Calendar for this month — look for teal/fuchsia/emerald dots.')
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1) })
