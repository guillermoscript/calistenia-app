import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Guardarraíl contra la interpolación cruda en filtros de PocketBase (issue #461).
//
// Un filtro construido con `` `user = "${userId}"` `` mete el valor en la
// gramática del filtro sin escapar. Una comilla dentro del valor rompe la
// consulta (400) en el mejor caso; en el peor —cuando el valor viene del
// usuario, como el buscador de admin o un `emoji`— cambia el significado del
// filtro. La forma correcta es vincular parámetros: `pb.filter('user = {:uid}',
// { uid })` en el SDK JS y el sexto argumento de `findRecordsByFilter` en los
// hooks del JSVM.
//
// Ni el typecheck ni el lint pueden ver esto: el filtro es un string y
// TypeScript lo da por bueno. Sin este test la conversión se deshace sola en
// cuanto alguien copie y pegue el patrón viejo de un fichero antiguo — que es
// exactamente como llegaron los ~40 sitios que arregló #461. `utils/blocks.js`
// tenía las dos formas a 26 líneas de distancia.
//
// El test escanea el código fuente y falla si encuentra un filtro con un valor
// interpolado. Solo mira contextos de filtro: hay plantillas interpoladas
// perfectamente legítimas que no son filtros (`require(`${__hooks}/utils/…`)`).

const CORE_LIB = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(CORE_LIB, '../../..')

const SCANNED_DIRS = [
  'packages/core',
  'apps/web/src',
  'apps/mobile/src',
  'mcp-server/src',
  'pb_hooks',
]

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.expo',
  'android',
  'ios',
])

const SOURCE_FILE = /\.(ts|tsx|js|mjs)$/
const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|mjs)$/

// Un valor interpolado dentro de una comparación de filtro:
//   `user = "${userId}"`      (plantilla, SDK JS)
//   "user = '" + userId + "'" (concatenación, JSVM de pb_hooks)
// El operador (=, !=, ~, !~, >, >=, <, <=) delante es lo que distingue un
// filtro de una URL o un mensaje de log con una interpolación cualquiera.
// El campo delante del operador es lo que separa un filtro de una URL: en un
// filtro hay un espacio (`user = …`, `created >= …`); en un query string no
// (`?session=` + id).
const OPERATOR = String.raw`(?:!=|>=|<=|!~|=|~|>|<)`
const FIELD_AND_OPERATOR = String.raw`\b[a-zA-Z_][\w.]*\s+${OPERATOR}\s*`
const TEMPLATE_INTERPOLATION = new RegExp(String.raw`${FIELD_AND_OPERATOR}["']?\$\{`)
// Concatenación del JSVM: `"user = '" + userId`, o `"challenge = \"" + id`.
const CONCAT_INTERPOLATION = new RegExp(
  String.raw`${FIELD_AND_OPERATOR}(?:\\?['"])?\s*["']\s*\+`,
)

// `pb.filter()` y `findRecordsByFilter(…, params)` ya escapan: una línea que
// interpola PLACEHOLDERS generados (`id = {:id${i}}`) es la forma correcta de
// construir un OR-chain dinámico, no una violación.
const BOUND_PLACEHOLDER = /\{:\s*[a-zA-Z_]/

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) walk(full, out)
    } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/** ¿La línea construye un filtro de PocketBase? */
function looksLikeFilter(line: string): boolean {
  if (/\bfilter\s*[:=]/.test(line)) return true
  if (/getFirstListItem\s*\(/.test(line)) return true
  if (/findRecordsByFilter\s*\(|findFirstRecordByFilter\s*\(/.test(line)) return true
  // El filtro puede ir en su propia línea como argumento suelto: se detecta
  // por la forma (una comparación entre comillas) en `collectViolations`.
  return false
}

/**
 * ¿La línea es un filtro pasado como argumento suelto, en su propia línea?
 *
 * Debe empezar por la comilla de apertura y por el nombre del campo: así una
 * frase en prosa que use `~` como «aproximadamente» (`~${n} min/noche`) no
 * cuenta como filtro, porque el `~` no va precedido de un campo al principio
 * del string.
 */
function looksLikeBareFilterArgument(line: string): boolean {
  const trimmed = line.trim()
  return new RegExp(String.raw`^["'\`]\(?\s*${FIELD_AND_OPERATOR}`).test(trimmed)
}

type Violation = { file: string; line: number; text: string }

function collectViolations(): Violation[] {
  const violations: Violation[] = []
  for (const dir of SCANNED_DIRS) {
    for (const file of walk(path.join(REPO_ROOT, dir))) {
      const lines = fs.readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, index) => {
        if (BOUND_PLACEHOLDER.test(line)) return
        const interpolates =
          TEMPLATE_INTERPOLATION.test(line) || CONCAT_INTERPOLATION.test(line)
        if (!interpolates) return
        if (!looksLikeFilter(line) && !looksLikeBareFilterArgument(line)) return
        violations.push({
          file: path.relative(REPO_ROOT, file),
          line: index + 1,
          text: line.trim(),
        })
      })
    }
  }
  return violations
}

describe('filtros de PocketBase', () => {
  it('no construye ningún filtro interpolando el valor (issue #461)', () => {
    const violations = collectViolations()
    const report = violations
      .map((v) => `  ${v.file}:${v.line}\n    ${v.text}`)
      .join('\n')
    expect(
      violations,
      violations.length === 0
        ? ''
        : `Filtros con valores interpolados sin vincular:\n${report}\n\n` +
            `Usa parámetros vinculados:\n` +
            `  SDK JS:   pb.filter('user = {:uid}', { uid: userId })\n` +
            `  pb_hooks: $app.findRecordsByFilter(col, 'user = {:u}', sort, limit, offset, { u: userId })\n`,
    ).toEqual([])
  })

  it('detecta las dos formas de interpolación cruda', () => {
    // El guardarraíl solo sirve si muerde; si alguien relaja los regex, esto avisa.
    expect(TEMPLATE_INTERPOLATION.test('filter: `user = "${userId}"`')).toBe(true)
    expect(CONCAT_INTERPOLATION.test(`"user = '" + userId + "'"`)).toBe(true)
    expect(CONCAT_INTERPOLATION.test('"challenge = \\"" + challengeId + "\\""')).toBe(true)
    // Y no debe morder lo que ya está bien ni lo que no es un filtro.
    expect(BOUND_PLACEHOLDER.test("pb.filter('user = {:uid}', { uid })")).toBe(true)
    expect(looksLikeFilter('require(`${__hooks}/utils/blocks.js`)')).toBe(false)
    // Un query string no lleva espacios alrededor del `=`; un filtro sí.
    expect(TEMPLATE_INTERPOLATION.test('`/feed?session=${sessionId}`')).toBe(false)
    expect(CONCAT_INTERPOLATION.test('"/feed?session=" + sessionId')).toBe(false)
  })
})
