#!/usr/bin/env node
/**
 * Borra de una base de datos los programas de prueba que dejan atrás el E2E, la
 * QA manual y los tests de dispositivo (issue #615).
 *
 * La base local acumula filas como `Mi Programa Test`, `Programa Test E2E`,
 * `Programa QA Cascade` o `Programa_ADB_Test`. Ensucian el catálogo, falsean
 * cualquier recuento y hacen ruido al comprobar si la migración de siembra ha
 * hecho su trabajo.
 *
 * ## El orden de borrado importa
 *
 * `program_phases`, `program_exercises` y `program_day_config` tienen
 * `cascadeDelete`, así que se van con el programa. `user_programs` NO: su
 * relación con `programs` es `required` y sin cascade, y esa combinación hace
 * que PocketBase **rechace el borrado del padre con un 400** en vez de limpiar
 * (es el mecanismo de #605). Basta una inscripción viva —y la QA suele dejar
 * una— para que el borrado falle. Por eso se borran primero las inscripciones.
 *
 * ## Uso
 *
 *   node scripts/clean-test-programs.mjs <PB_URL> <EMAIL> <PASSWORD>          # lista
 *   node scripts/clean-test-programs.mjs <PB_URL> <EMAIL> <PASSWORD> --yes    # borra
 *
 * Sin `--yes` no borra nada: enseña lo que haría y sale. Es un script que borra
 * datos y se apunta a una URL arbitraria, así que apuntarlo a producción por
 * accidente no puede costar más que un listado.
 */

const PB_URL = process.argv[2]
const SU_EMAIL = process.argv[3]
const SU_PASSWORD = process.argv[4]
const CONFIRMED = process.argv.includes('--yes')

if (!PB_URL || !SU_EMAIL || !SU_PASSWORD) {
  console.error('Usage: node scripts/clean-test-programs.mjs <PB_URL> <EMAIL> <PASSWORD> [--yes]')
  process.exit(1)
}

/**
 * Un nombre es de prueba si casa con alguno de estos patrones.
 *
 * Se comparan contra `name.es` en minúsculas. Son deliberadamente estrechos:
 * un patrón suelto como `/test/` se llevaría por delante un programa real que
 * alguien llamara «Test de fuerza», y este script borra sin vuelta atrás.
 */
const TEST_PATTERNS = [
  /^mi programa test$/,
  /^programa test e2e$/,
  /^programa qa /,
  /^programa_adb_test$/,
  /^programa de prueba$/,
  /^test program$/,
]

const isTestName = (name) => TEST_PATTERNS.some(re => re.test(name.trim().toLowerCase()))

async function api(path, opts = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${path}: ${body}`)
  }
  if (res.status === 204 || opts.method === 'DELETE') return {}
  return res.json()
}

async function fetchAll(path, authH) {
  let page = 1
  let items = []
  while (true) {
    const res = await api(`${path}${path.includes('?') ? '&' : '?'}perPage=200&page=${page}`, { headers: authH })
    items = items.concat(res.items)
    if (items.length >= res.totalItems) break
    page++
  }
  return items
}

const esName = (p) => (typeof p.name === 'object' ? (p.name?.es || '') : (p.name || ''))

async function main() {
  const auth = await api('/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: SU_EMAIL, password: SU_PASSWORD }),
  })
  const authH = { Authorization: `Bearer ${auth.token}` }

  const programs = await fetchAll('/api/collections/programs/records', authH)
  const targets = programs.filter(p => isTestName(esName(p)))

  if (targets.length === 0) {
    console.log(`✅ Sin programas de prueba (${programs.length} programas en total).`)
    return
  }

  console.log(`🔎 ${targets.length} programa(s) de prueba de ${programs.length}:`)
  for (const p of targets) {
    console.log(`   · ${esName(p)}  (${p.id})`)
  }

  if (!CONFIRMED) {
    console.log('\n⚠️  No se ha borrado nada. Repite con --yes para borrarlos.')
    return
  }

  for (const p of targets) {
    // Las inscripciones primero: `user_programs.program` es `required` y sin
    // cascade, así que con una viva PocketBase rechaza el borrado del programa.
    const enrollments = await fetchAll(
      `/api/collections/user_programs/records?filter=(program='${p.id}')`,
      authH,
    )
    for (const e of enrollments) {
      await api(`/api/collections/user_programs/records/${e.id}`, { method: 'DELETE', headers: authH })
    }

    await api(`/api/collections/programs/records/${p.id}`, { method: 'DELETE', headers: authH })
    const withEnrollments = enrollments.length ? ` (+${enrollments.length} inscripción/es)` : ''
    console.log(`   🗑  ${esName(p)}${withEnrollments}`)
  }

  console.log(`\n✅ ${targets.length} programa(s) de prueba borrados.`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
