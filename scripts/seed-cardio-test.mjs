/**
 * Quick seed: cardio sessions (with GPS + elevation + splits) for the local
 * test-b account, so the cardio detail screen / map / elevation / Calendar
 * tap-through can be exercised end to end.
 *
 *   node scripts/seed-cardio-test.mjs
 *
 * Idempotent-ish: each run appends new sessions (delete via PB admin if needed).
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

// Build a GPS loop of `n` points around a base coord, with a sinusoidal altitude
// profile so the ElevationProfile chart has something to draw.
function buildTrack(baseLat, baseLng, n, radiusDeg, baseAlt, startMs) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * Math.PI * 2 * 1.5 // 1.5 loops
    const r = radiusDeg * (1 + 0.15 * Math.sin(i / 4)) // slight wobble
    pts.push({
      lat: +(baseLat + r * Math.cos(t)).toFixed(6),
      lng: +(baseLng + r * Math.sin(t) * 1.3).toFixed(6),
      alt: Math.round(baseAlt + 30 * Math.sin(2 * t) + 15 * Math.sin(t)),
      speed: +(2.6 + 0.8 * Math.sin(i / 3)).toFixed(2),
      timestamp: startMs + i * 30_000, // a point every 30s
    })
  }
  return pts
}

function splits(km, basePace) {
  return Array.from({ length: km }, (_, i) => {
    const pace = Math.round(basePace + 25 * Math.sin(i))
    return { km: i + 1, pace, time: pace }
  })
}

const SESSIONS = [
  {
    activity_type: 'running',
    started_at: '2026-06-20T07:30:00Z',
    distance_km: 5.12, duration_seconds: 1723, avg_pace: 337, max_pace: 292,
    elevation_gain: 48, calories_burned: 312, note: 'Tirada larga matutina — piernas pesadas pero bien.',
    track: ['madrid', 60, 0.006, 665], splitKm: 5, basePace: 330,
  },
  {
    activity_type: 'cycling',
    started_at: '2026-06-17T18:05:00Z',
    distance_km: 18.4, duration_seconds: 2940, avg_speed_kmh: 22.5, max_speed_kmh: 38.1,
    avg_pace: 0, elevation_gain: 140, calories_burned: 430, note: 'Ruta tarde, viento en contra a la vuelta.',
    track: ['madrid', 80, 0.012, 660], splitKm: 18, basePace: 160,
  },
  {
    activity_type: 'walking',
    started_at: '2026-06-14T09:15:00Z',
    distance_km: 2.31, duration_seconds: 1620, avg_pace: 701, max_pace: 612,
    elevation_gain: 22, calories_burned: 118, note: '',
    track: ['madrid', 30, 0.004, 668], splitKm: 2, basePace: 700,
  },
]

const BASES = { madrid: [40.4168, -3.7038] }

async function main() {
  console.log(`→ auth ${IDENTITY} @ ${PB}`)
  const auth = await api('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: IDENTITY, password: PASSWORD }),
  })
  const token = auth.token
  const uid = auth.record.id
  console.log(`  ok uid=${uid}`)

  for (const s of SESSIONS) {
    const [baseKey, n, radius, baseAlt] = s.track
    const [bLat, bLng] = BASES[baseKey]
    const startMs = Date.parse(s.started_at)
    const gps = buildTrack(bLat, bLng, n, radius, baseAlt, startMs)
    const finished = new Date(startMs + s.duration_seconds * 1000).toISOString()
    const rec = {
      user: uid,
      activity_type: s.activity_type,
      gps_points: gps,
      distance_km: s.distance_km,
      duration_seconds: s.duration_seconds,
      avg_pace: s.avg_pace ?? 0,
      max_pace: s.max_pace ?? 0,
      avg_speed_kmh: s.avg_speed_kmh ?? 0,
      max_speed_kmh: s.max_speed_kmh ?? 0,
      elevation_gain: s.elevation_gain,
      calories_burned: s.calories_burned,
      note: s.note,
      started_at: s.started_at,
      finished_at: finished,
      splits: splits(s.splitKm, s.basePace),
    }
    const created = await api('/api/collections/cardio_sessions/records', {
      method: 'POST',
      body: JSON.stringify(rec),
    }, token)
    console.log(`  + ${s.activity_type.padEnd(8)} ${s.distance_km}km  ${s.started_at.slice(0, 10)}  id=${created.id}  (${gps.length} gps pts)`)
  }
  console.log('done. Calendar (junio 2026) días 14 / 17 / 20 ahora tienen cardio.')
}

main().catch(e => { console.error('SEED FAILED:', e.message); process.exit(1) })
