/**
 * Rutas custom: public_referral_lookup.pb.js (lookup público mínimo, fix
 * GHSA-wwj3-9h95-wcpf) y race_og_tags.pb.js (OG tags solo para crawlers
 * y solo carreras públicas).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { api, create, createUser, createAs, update, uniq, localDateString } from "./helpers/client.mjs"

const BOT_UA = "facebookexternalhit/1.1"

test("referral-lookup devuelve solo campos públicos", async () => {
  const user = await createUser("Invitador Publico")
  // El campo referral_code valida ^[A-Z0-9\-]*$ (máx 20)
  const code = uniq("REF").toUpperCase().replace(/_/g, "-").slice(0, 20)
  await update("users", user.id, { referral_code: code })

  const res = await api(`/api/public/referral-lookup/${code}`, { raw: true })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.id, user.id)
  assert.equal(body.display_name, "Invitador Publico")
  assert.deepEqual(
    Object.keys(body).sort(),
    ["avatarUrl", "display_name", "id"],
    "no filtra ningún campo extra (email, referral_code, etc.)"
  )
})

test("referral-lookup con código desconocido → 404", async () => {
  const res = await api("/api/public/referral-lookup/no-existe-xyz", { raw: true })
  assert.equal(res.status, 404)
})

test("race OG tags para crawler en carrera pública", async () => {
  const creator = await createUser("Corredor OG")
  const race = await createAs(creator, "races", {
    creator: creator.id,
    name: "Gran Fondo Test",
    status: "pending",
    is_public: true,
    mode: "distance",
    target_distance_km: 5,
    activity_type: "running",
  })

  const res = await api(`/race/${race.id}`, { raw: true, headers: { "User-Agent": BOT_UA } })
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.match(html, /og:title/)
  assert.match(html, /Gran Fondo Test/)
  assert.match(html, /5 km/)
})

test("race OG tags escapa HTML en el nombre (XSS)", async () => {
  const creator = await createUser("Corredor XSS")
  const race = await createAs(creator, "races", {
    creator: creator.id,
    name: '<script>alert(1)</script>"onload="x',
    status: "pending",
    is_public: true,
    mode: "distance",
    target_distance_km: 5,
    activity_type: "running",
  })

  const res = await api(`/race/${race.id}`, { raw: true, headers: { "User-Agent": BOT_UA } })
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.ok(!html.includes("<script>alert"), "no inyecta el script crudo")
  assert.match(html, /&lt;script&gt;/, "el nombre va escapado")
  assert.match(html, /&quot;onload=&quot;/, "las comillas van escapadas")
})

test("race OG tags en modo tiempo muestra minutos", async () => {
  const creator = await createUser("Corredor Tiempo")
  const race = await createAs(creator, "races", {
    creator: creator.id,
    name: "Carrera 30 Minutos",
    status: "pending",
    is_public: true,
    mode: "time",
    target_duration_seconds: 1800,
    activity_type: "running",
  })

  const res = await api(`/race/${race.id}`, { raw: true, headers: { "User-Agent": BOT_UA } })
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.match(html, /30 min/)
})

test("race OG tags no filtra carreras privadas ni responde a browsers", async () => {
  const creator = await createUser("Corredor Privado")
  const race = await createAs(creator, "races", {
    creator: creator.id,
    name: "Carrera Secreta",
    status: "pending",
    is_public: false,
    mode: "distance",
    target_distance_km: 10,
    activity_type: "running",
  })

  // Crawler + carrera privada → e.next() (sin publicDir en el test env: 404)
  const bot = await api(`/race/${race.id}`, { raw: true, headers: { "User-Agent": BOT_UA } })
  const botText = await bot.text()
  assert.ok(!botText.includes("Carrera Secreta"), "no filtra el nombre de una carrera privada")

  // Browser normal + carrera pública → tampoco intercepta
  const pub = await createAs(creator, "races", {
    creator: creator.id,
    name: "Carrera Browser",
    status: "pending",
    is_public: true,
    mode: "distance",
    target_distance_km: 3,
    activity_type: "running",
  })
  const browser = await api(`/race/${pub.id}`, { raw: true, headers: { "User-Agent": "Mozilla/5.0" } })
  const browserText = await browser.text()
  assert.ok(!browserText.includes("og:title"), "browser normal no recibe el HTML de OG")
})

// ── Preview pública de retos express (#313) ──────────────────────────────────

async function makeExpressChallenge(creator, extra = {}) {
  const exercise = await create("exercises_catalog", {
    name: { es: "Dominadas", en: "Pull-ups" },
    slug: uniq("pullup").toLowerCase(),
  })
  return createAs(creator, "challenges", {
    creator: creator.id,
    title: "Challenge de Dominadas — 20 x 7d",
    metric: "exercise",
    exercise_slug: exercise.slug,
    // Fechas relativas y en curso: desde #515 el cron `challenges_expiry` cierra
    // los `active` con `ends_at` pasado, y una fecha literal ya vencida haría que
    // este reto cambiara de estado a mitad de suite si la pasada horaria del cron
    // cae dentro del run.
    starts_at: localDateString(-1),
    ends_at: localDateString(6),
    status: "active",
    type: "express",
    exercise_id: exercise.id,
    daily_target: 20,
    duration_days: 7,
    ...extra,
  })
}

test("challenge-preview devuelve la tarjeta pública de un reto express", async () => {
  const creator = await createUser("Creador Express")
  const challenge = await makeExpressChallenge(creator)
  await createAs(creator, "challenge_participants", { challenge: challenge.id, user: creator.id })

  // Sin token: el endpoint es para invitados sin cuenta
  const res = await api(`/api/public/challenge-preview/${challenge.id}`, { raw: true })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.id, challenge.id)
  assert.equal(body.title, "Challenge de Dominadas — 20 x 7d")
  assert.equal(body.exercise_name, "Dominadas")
  assert.equal(body.daily_target, 20)
  assert.equal(body.duration_days, 7)
  assert.equal(body.participant_count, 1)
  assert.deepEqual(
    Object.keys(body).sort(),
    ["daily_target", "duration_days", "exercise_name", "id", "participant_count", "status", "title"],
    "no filtra ningún campo extra (creator, descripción, etc.)"
  )
})

test("challenge-preview de un reto normal → 404 (solo expone express)", async () => {
  const creator = await createUser("Creador Normal")
  const challenge = await createAs(creator, "challenges", {
    creator: creator.id,
    title: "Reto privado normal",
    metric: "most_sessions",
    starts_at: localDateString(-1),
    ends_at: localDateString(6),
    status: "active",
  })

  const res = await api(`/api/public/challenge-preview/${challenge.id}`, { raw: true })
  assert.equal(res.status, 404)
})

test("challenge-preview con id desconocido → 404", async () => {
  const res = await api("/api/public/challenge-preview/noexiste1234567", { raw: true })
  assert.equal(res.status, 404)
})
