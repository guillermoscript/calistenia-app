#!/usr/bin/env node
/**
 * ¿Qué versiones de la app hay vivas ahí fuera?
 *
 * Es la mitad que cierra el bucle del version gate: `pb_hooks/client_telemetry.pb.js`
 * anota en `users` el build de cada quien al autenticar, y esto lo lee para
 * responder a la única pregunta que de verdad importa antes de retirar algo del
 * esquema (la fase "contract" de docs/schema-evolution.md):
 *
 *   ¿Queda alguien activo por debajo del build que necesito?
 *
 * Uso:
 *   node scripts/client-versions.mjs <PB_URL> <SUPERUSER_EMAIL> <SUPERUSER_PASSWORD> [--dias 30] [--min 31]
 *
 * Ejemplo:
 *   node scripts/client-versions.mjs https://gym.guille.tech admin@... '...' --min 31
 *
 * `--dias`  ventana de actividad (default 30). Un usuario que no abre la app
 *           desde hace meses no debería bloquear una limpieza de esquema.
 * `--min`   build objetivo: si se pasa, imprime el veredicto de si ya se puede
 *           contraer.
 */

const [, , PB_URL, SU_EMAIL, SU_PASS, ...rest] = process.argv

if (!PB_URL || !SU_EMAIL || !SU_PASS) {
  console.error('Uso: node scripts/client-versions.mjs <PB_URL> <EMAIL> <PASSWORD> [--dias 30] [--min <build>]')
  process.exit(1)
}

function flag(name, fallback) {
  const i = rest.indexOf(`--${name}`)
  return i !== -1 && rest[i + 1] !== undefined ? Number(rest[i + 1]) : fallback
}

const DAYS = flag('dias', 30)
const MIN_BUILD = flag('min', null)

/** Umbral por debajo del cual se considera seguro retirar algo (ver el doc). */
const SAFE_THRESHOLD_PCT = 1

async function main() {
  const authRes = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: SU_EMAIL, password: SU_PASS }),
  })
  if (!authRes.ok) {
    console.error(`✗ No se pudo autenticar (${authRes.status}): ${await authRes.text()}`)
    process.exit(1)
  }
  const { token } = await authRes.json()

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19)

  // Solo usuarios activos en la ventana. Los que nunca se vieron (last_seen_at
  // vacío) quedan fuera: son cuentas de antes de que existiera la telemetría o
  // gente que no vuelve, y contarlas haría que el porcentaje nunca bajara.
  const filter = encodeURIComponent(`last_seen_at >= "${since}"`)
  const users = []
  for (let page = 1; ; page++) {
    const res = await fetch(
      `${PB_URL}/api/collections/users/records?perPage=500&page=${page}&filter=${filter}&fields=app_build,app_version,app_platform,last_seen_at`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) {
      console.error(`✗ Error listando usuarios (${res.status}): ${await res.text()}`)
      process.exit(1)
    }
    const body = await res.json()
    users.push(...body.items)
    if (page >= body.totalPages) break
  }

  if (users.length === 0) {
    console.log(`Sin usuarios activos en los últimos ${DAYS} días con telemetría.`)
    console.log('Si acabas de desplegar el version gate, es lo esperado: las filas se')
    console.log('rellenan cuando cada usuario vuelve a autenticar.')
    return
  }

  const byPlatform = new Map()
  for (const u of users) {
    const platform = u.app_platform || '(sin identificar)'
    if (!byPlatform.has(platform)) byPlatform.set(platform, new Map())
    const builds = byPlatform.get(platform)
    const key = `${u.app_build || 0}|${u.app_version || ''}`
    builds.set(key, (builds.get(key) || 0) + 1)
  }

  console.log(`\nUsuarios activos en los últimos ${DAYS} días: ${users.length}\n`)

  for (const [platform, builds] of [...byPlatform].sort()) {
    const total = [...builds.values()].reduce((a, b) => a + b, 0)
    console.log(`${platform}  (${total})`)
    const rows = [...builds]
      .map(([key, count]) => {
        const [build, version] = key.split('|')
        return { build: Number(build), version, count }
      })
      .sort((a, b) => b.build - a.build)

    for (const r of rows) {
      const pct = ((r.count / users.length) * 100).toFixed(1)
      const label = r.build === 0 ? 'sin build' : `build ${r.build}`
      console.log(`  ${label.padEnd(12)} ${(r.version || '—').padEnd(10)} ${String(r.count).padStart(5)}  ${pct.padStart(5)}%`)
    }
    console.log('')
  }

  if (MIN_BUILD !== null) {
    // `app_build = 0` es "no se identificó" (web, o un cliente muy viejo). Cuenta
    // como riesgo: no podemos afirmar que esté por encima del mínimo.
    const below = users.filter((u) => (u.app_build || 0) < MIN_BUILD).length
    const pct = (below / users.length) * 100
    console.log(`Por debajo del build ${MIN_BUILD}: ${below} usuarios (${pct.toFixed(2)}%)`)
    if (pct <= SAFE_THRESHOLD_PCT) {
      console.log(`✓ Por debajo del umbral del ${SAFE_THRESHOLD_PCT}% — se puede contraer el esquema.`)
    } else {
      console.log(`✗ Todavía por encima del ${SAFE_THRESHOLD_PCT}%. Mantén el dual write o sube min_supported_build en app_config.`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
