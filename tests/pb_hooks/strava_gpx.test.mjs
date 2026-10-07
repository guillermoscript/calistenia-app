/** Piezas puras de la subida a Strava (#914): GPX, deporte, duplicados. */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// El paquete es "type": "module" pero los utils de pb_hooks son CommonJS para el
// JSVM de PocketBase: se evalúan con un `module` propio en vez de `require`.
const mod = { exports: {} }
new Function("module", readFileSync(new URL("../../pb_hooks/utils/strava_gpx.js", import.meta.url), "utf8"))(mod)
const g = mod.exports

const T0 = Date.UTC(2026, 6, 25, 8, 0, 0)

test("buildGpx: puntos con hora y altitud; un `gap` abre un trkseg nuevo", () => {
  const xml = g.buildGpx([
    { lat: 40.1, lng: -3.1, alt: 660, timestamp: T0 },
    { lat: 40.2, lng: -3.2, timestamp: T0 + 1000 },
    { lat: 40.3, lng: -3.3, timestamp: T0 + 60000, gap: true },
  ], { name: "Mañana <5k> & más" })
  assert.equal((xml.match(/<trkseg>/g) || []).length, 2)
  assert.match(xml, /<ele>660.0<\/ele>/)
  assert.match(xml, /<time>2026-07-25T08:00:00.000Z<\/time>/)
  assert.match(xml, /Mañana &lt;5k&gt; &amp; más/)
})

test("buildGpx: descarta puntos sin hora o sin coordenadas finitas", () => {
  const pts = [
    { lat: 1, lng: 2, timestamp: T0 },
    { lat: 1, lng: 2 },
    { lat: NaN, lng: 2, timestamp: T0 },
    null,
  ]
  assert.equal(g.usablePoints(pts), 1)
  assert.equal((g.buildGpx(pts).match(/<trkpt /g) || []).length, 1)
})

test("sportType, nombre y descripción", () => {
  assert.equal(g.sportType("running"), "Run")
  assert.equal(g.sportType("cycling"), "Ride")
  assert.equal(g.sportType("raro"), "Workout")
  assert.equal(g.activityName({ activity_type: "walking", note: "  " }), "Caminata")
  assert.equal(g.activityName({ activity_type: "running", note: "  Series   en el parque " }), "Series en el parque")
  assert.match(g.activityDescription({ hr_avg: 151.4, calories_actual: 320 }), /FC media 151 ppm · 320 kcal · Registrado con Calistenia/)
})

test("parseDuplicateActivityId reconoce el aviso de Strava", () => {
  assert.equal(g.parseDuplicateActivityId("calistenia.gpx duplicate of activity 123456789"), 123456789)
  assert.equal(g.parseDuplicateActivityId("duplicate of <a href='/activities/9'>activity 9</a>"), 9)
  assert.equal(g.parseDuplicateActivityId("otro error"), 0)
})
