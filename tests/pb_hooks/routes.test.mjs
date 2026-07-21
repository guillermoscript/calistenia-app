/**
 * Rutas custom: public_referral_lookup.pb.js (lookup público mínimo, fix
 * GHSA-wwj3-9h95-wcpf) y race_og_tags.pb.js (OG tags solo para crawlers
 * y solo carreras públicas).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { api, createUser, createAs, update, uniq } from "./helpers/client.mjs"

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
