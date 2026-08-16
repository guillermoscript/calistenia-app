#!/usr/bin/env node
/**
 * Guardarraíl de evolución de esquema — la fase "contract" de
 * docs/schema-evolution.md, en CI.
 *
 * EL PROBLEMA QUE RESUELVE: la app vive en Play, así que en todo momento hay
 * versiones viejas del cliente ahí fuera. Una migración que BORRA un campo, lo
 * renombra o lo vuelve `required` no rompe los tests ni el typecheck: rompe a
 * quien todavía no ha actualizado, en producción, y a veces en silencio (una
 * regla que deja de casar devuelve 0 filas sin error).
 *
 * QUÉ HACE: revisa la función UP de cada migración nueva y falla si hace algo
 * destructivo sin una nota explícita que diga por qué es seguro:
 *
 *   // CONTRACT-OK: el campo `foo` lleva desde el build 28 sin lectores y
 *   // client-versions.mjs da 0.0% por debajo de 31.
 *
 * La función DOWN se ignora a propósito: ahí borrar es lo correcto, es el
 * rollback.
 *
 * BASELINE: las migraciones anteriores a este prefijo están indultadas — son
 * las 198 que ya existían cuando se añadió el guardarraíl. El número solo
 * significa "de aquí en adelante"; no hace falta tocarlo nunca.
 *
 * Uso:  node scripts/check-schema-contract.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS_DIR = join(ROOT, 'pb_migrations')

/** Todo lo anterior a este prefijo se creó antes del guardarraíl. */
const BASELINE_PREFIX = 1784200000

/**
 * Una migración que CREA la colección está exenta: no hay ningún cliente
 * instalado que la conozca todavía, así que `required: true` o unas reglas
 * cerradas no pueden romper a nadie. El riesgo aparece al tocar lo que ya
 * existe, y para eso está el resto del chequeo.
 */
const CREATES_COLLECTION = /new Collection\s*\(/

/** Frontera up/down: `}, (app) => {` en columna 0 (182 de 198 migraciones). */
const DOWN_BOUNDARY = /^\}, \(app\) => \{/m

const ACK = /CONTRACT-OK:/

const RULES = [
  {
    id: 'borra-campo',
    pattern: /fields\.(removeById|removeByName)\s*\(/,
    why: 'borra un campo: los clientes viejos que aún lo leen o lo escriben empezarán a fallar',
  },
  {
    id: 'borra-coleccion',
    pattern: /app\.delete\s*\(/,
    why: 'borra una colección entera',
  },
  {
    id: 'campo-requerido',
    pattern: /required:\s*true/,
    why: 'marca un campo como required: un cliente viejo que no lo manda recibirá 400 en cada escritura',
  },
  {
    id: 'endurece-regla',
    // Pasar una regla a null la cierra a todo el mundo salvo superusuarios.
    pattern: /(list|view|create|update|delete)Rule\s*=\s*null/,
    why: 'cierra una API rule: PocketBase NO devuelve error, devuelve 0 filas — los clientes viejos se quedan ciegos en silencio',
  },
]

function upSection(source) {
  const match = DOWN_BOUNDARY.exec(source)
  return match ? source.slice(0, match.index) : source
}

const offenders = []

for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
  if (!file.endsWith('.js')) continue

  const prefix = Number.parseInt(file.split('_')[0], 10)
  if (!Number.isFinite(prefix) || prefix < BASELINE_PREFIX) continue

  const source = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
  if (ACK.test(source)) continue

  const up = upSection(source)
  if (CREATES_COLLECTION.test(up)) continue

  const hits = RULES.filter((rule) => rule.pattern.test(up))
  if (hits.length > 0) offenders.push({ file, hits })
}

if (offenders.length === 0) {
  console.log('✓ Ninguna migración nueva hace cambios destructivos sin justificar.')
  process.exit(0)
}

console.error('\n✗ Migraciones que rompen a los clientes ya instalados:\n')
for (const { file, hits } of offenders) {
  console.error(`  ${file}`)
  for (const hit of hits) console.error(`    · ${hit.id} — ${hit.why}`)
}

console.error(`
Los clientes viejos no desaparecen al desplegar: siguen en los móviles de la
gente durante semanas. Antes de seguir, decide cuál de estas es tu situación:

  1. Es un cambio aditivo disfrazado. Reescríbelo como expand:
     campo nuevo opcional + dual write, y deja el viejo donde está.

  2. Ya nadie usa lo que borras. Compruébalo, no lo supongas:
       node scripts/client-versions.mjs <PB_URL> <EMAIL> <PASS> --min <build>
     Si sale por debajo del 1%, añade la nota con el dato:
       // CONTRACT-OK: <por qué es seguro, con el porcentaje medido>

  3. Es urgente y no hay forma compatible. Entonces el cambio va acompañado
     de subir \`min_supported_build\` en la colección app_config, para que los
     clientes viejos vean el gate en vez de romperse.

Detalle completo: docs/schema-evolution.md
`)
process.exit(1)
