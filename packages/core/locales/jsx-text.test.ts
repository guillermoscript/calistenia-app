import { describe, it, expect } from 'vitest'
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// El otro lado del guardarraíl de #444 (issue #484).
//
// `usage.test.ts` escanea las llamadas `t('…')` y comprueba que la clave existe
// en los dos locales. Eso cubre el texto que YA pasa por i18n, pero es ciego a
// lo contrario: una cadena escrita a pelo dentro del JSX nunca llama a `t()`,
// así que no aparece en ese escaneo, no rompe la paridad es/en y no la ve ni el
// typecheck ni el lint. Ficheros enteros de copy en español se colaron así.
//
// Este test parsea cada `.tsx` de las dos apps con el AST de TypeScript y busca
// dos sitios donde el texto llega al usuario sin pasar por `t()`:
//
//   1. nodos `JsxText` — `<p>Guardar cambios</p>`
//   2. atributos de los que sí lee una persona — `placeholder`, `aria-label`,
//      `accessibilityLabel`… — cuando el valor es un literal
//
// Un regex por línea no vale aquí: `className="flex ..."` y `'use client'` son
// literales igual de válidos, y el texto JSX se parte en varios nodos cuando
// hay `{…}` en medio. El AST distingue las tres cosas sin heurística.
//
// ## Por qué "español" y no "cualquier literal"
//
// Marcar TODO literal ahogaría la señal: `WGER`, `PR`, `kcal`, `·`, `24h` y los
// nombres propios son texto JSX legítimo. El filtro busca lo que delata copy sin
// traducir: letras que solo existen en español (`áéíóúüñ¿¡`) o alguna palabra de
// la lista de abajo. Es una red, no un detector de idioma — si se cuela una
// frase en español sin acentos ni palabra conocida, se amplía `SPANISH_WORDS`.
//
// ## Baseline
//
// El barrido de #484 limpió los ficheros que listaba el issue; el resto se
// congela en `jsx-text-baseline.json` con su número exacto de infracciones. El
// test falla si un fichero fuera del baseline tiene UNA sola, si uno del
// baseline tiene MÁS de las apuntadas, o si tiene MENOS (entonces toca bajar el
// número: el trinquete solo gira hacia abajo). `exempt` es para lo que no se va
// a traducir nunca — hoy solo el texto legal.

const LOCALES_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(LOCALES_DIR, '../../..')

const APP_DIRS = ['apps/web/src', 'apps/mobile/src']
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.expo', 'android', 'ios', 'coverage'])
const SOURCE_FILE = /\.tsx$/
const TEST_FILE = /\.(test|spec)\.tsx$/

// Letras y signos que no existen fuera del español (y del resto de romances,
// pero en este repo el idioma de origen siempre es el español).
const SPANISH_LETTERS = /[áéíóúüñÁÉÍÓÚÜÑ¿¡]/

// Palabras que aparecen en el copy del producto y sobreviven sin acento. La
// lista es deliberadamente corta y ampliable: cada palabra nueva que se cuele
// en una revisión se añade aquí.
const SPANISH_WORDS = [
  // función
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'y', 'o', 'u',
  'que', 'en', 'con', 'sin', 'para', 'por', 'sobre', 'entre', 'desde', 'hasta', 'segun',
  'tu', 'tus', 'su', 'sus', 'mi', 'mis', 'te', 'le', 'les', 'lo', 'nos', 'se', 'ti', 'me',
  'es', 'son', 'esta', 'estan', 'estas', 'este', 'estos', 'ese', 'esa', 'eso', 'esos', 'esas',
  'no', 'si', 'ya', 'hay', 'muy', 'mas', 'menos', 'como', 'pero', 'porque', 'cuando', 'donde',
  'todo', 'toda', 'todos', 'todas', 'cada', 'otro', 'otra', 'otros', 'otras', 'aun', 'aqui',
  'ahora', 'antes', 'despues', 'siempre', 'nunca', 'tambien', 'solo', 'algo', 'nada', 'nadie',
  // verbos de interfaz
  'guardar', 'guardado', 'guardados', 'cancelar', 'cancelado', 'anadir', 'agregar', 'eliminar',
  'borrar', 'crear', 'editar', 'buscar', 'cargar', 'cargando', 'enviar', 'volver', 'salir',
  'empezar', 'continuar', 'terminar', 'terminado', 'completar', 'completado', 'completada',
  'importar', 'exportar', 'compartir', 'copiar', 'seleccionar', 'elegir', 'aceptar', 'cerrar',
  'abrir', 'instalar', 'descargar', 'activar', 'desactivar', 'reintentar', 'ver', 'toca',
  'pulsa', 'escribe', 'introduce', 'prueba', 'espera', 'listo', 'hecho', 'siguiente', 'anterior',
  // dominio
  'entrenamiento', 'entrenamientos', 'entrena', 'ejercicio', 'ejercicios', 'sesion', 'sesiones',
  'serie', 'series', 'repeticion', 'repeticiones', 'reps', 'descanso', 'circuito', 'circuitos',
  'programa', 'programas', 'rutina', 'rutinas', 'reto', 'retos', 'batalla', 'batallas',
  'usuario', 'usuarios', 'perfil', 'amigo', 'amigos', 'ranking', 'racha', 'progreso', 'peso',
  'comida', 'comidas', 'nutricion', 'despensa', 'receta', 'recetas', 'agua', 'objetivo',
  'objetivos', 'recordatorio', 'recordatorios', 'notificacion', 'notificaciones', 'ajustes',
  'cuenta', 'semana', 'semanal', 'dia', 'dias', 'hora', 'horas', 'minuto', 'minutos',
  'version', 'versiones', 'aplicacion', 'pantalla', 'navegador', 'archivo', 'fuente',
]
const SPANISH_WORDS_RE = new RegExp(
  `(^|[^\\p{L}])(${SPANISH_WORDS.join('|')})([^\\p{L}]|$)`,
  'iu',
)

// Atributos cuyo valor lee una persona. `title`/`alt` son los clásicos de la
// web; `accessibility*` son los de React Native.
const HUMAN_ATTRS = new Set([
  'placeholder',
  'title',
  'alt',
  'label',
  'aria-label',
  'aria-description',
  'accessibilityLabel',
  'accessibilityHint',
])

interface Finding {
  file: string
  line: number
  kind: string
  text: string
}

function walk(dir: string, out: string[] = []): string[] {
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

/** Devuelve el texto normalizado si parece copy en español; si no, `null`. */
function spanishCopy(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return null
  // Sin letras no hay copy: `·`, `—`, `24 / 7`, emojis sueltos.
  if (!/\p{L}/u.test(text)) return null
  if (SPANISH_LETTERS.test(text) || SPANISH_WORDS_RE.test(text)) return text
  return null
}

function literalOf(initializer: ts.JsxAttributeValue | undefined): ts.StringLiteralLike | null {
  if (!initializer) return null
  if (ts.isStringLiteral(initializer)) return initializer
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    const inner = initializer.expression
    if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) return inner
  }
  return null
}

function scan(file: string, relative: string): Finding[] {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  )
  const findings: Finding[] = []
  const lineOf = (node: ts.Node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const text = spanishCopy(node.text)
      if (text) findings.push({ file: relative, line: lineOf(node), kind: 'texto', text })
    } else if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text
      if (HUMAN_ATTRS.has(name)) {
        const literal = literalOf(node.initializer)
        const text = literal && spanishCopy(literal.text)
        if (text) findings.push({ file: relative, line: lineOf(node), kind: name, text })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return findings
}

interface Baseline {
  exempt: Record<string, string>
  pending: Record<string, number>
}

const BASELINE_FILE = path.join(LOCALES_DIR, 'jsx-text-baseline.json')
const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) as Baseline

const findings = APP_DIRS.flatMap((appDir) =>
  walk(path.join(REPO_ROOT, appDir)).flatMap((file) => scan(file, path.relative(REPO_ROOT, file))),
)

const countByFile = new Map<string, number>()
for (const finding of findings) {
  countByFile.set(finding.file, (countByFile.get(finding.file) ?? 0) + 1)
}

// Regenerar `pending` tras un barrido:
//   UPDATE_JSX_BASELINE=1 pnpm --filter @calistenia/core test jsx-text
// `exempt` se conserva tal cual — esa lista se cura a mano.
if (process.env.UPDATE_JSX_BASELINE) {
  const pending = Object.fromEntries(
    [...countByFile.entries()]
      .filter(([file]) => !(file in baseline.exempt))
      .sort(([a], [b]) => a.localeCompare(b)),
  )
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify({ ...baseline, pending }, null, 2)}\n`)
  baseline.pending = pending
}

describe('texto JSX sin t()', () => {
  // Si el AST deja de encontrar nada (una API de TS que cambia, un walk que
  // apunta a un directorio vacío), todo lo de abajo pasa en vacío. El baseline
  // es la prueba de vida: sabemos que esos ficheros tienen texto sin traducir.
  it('el escaneo sigue vivo', () => {
    const scanned = APP_DIRS.flatMap((appDir) => walk(path.join(REPO_ROOT, appDir)))
    expect(scanned.length).toBeGreaterThan(200)
    expect(findings.length).toBeGreaterThan(0)
  })

  it('ningún fichero nuevo mete texto en español fuera de t()', () => {
    const known = new Set([...Object.keys(baseline.exempt), ...Object.keys(baseline.pending)])
    const offenders = findings
      .filter((f) => !known.has(f.file))
      .map((f) => `${f.file}:${f.line} [${f.kind}] ${f.text.slice(0, 80)}`)
    // Envuelve el texto en t('clave') y añade la clave a locales/es y locales/en.
    // Ojo: `t('clave') || 'fallback'` NO hace fallback — cuando la clave no
    // existe, t() devuelve la propia clave, que es truthy (#444).
    expect(offenders).toEqual([])
  })

  it('los ficheros del baseline no empeoran', () => {
    const worse = Object.entries(baseline.pending)
      .filter(([file, allowed]) => (countByFile.get(file) ?? 0) > allowed)
      .map(([file, allowed]) => `${file}: ${countByFile.get(file)} > ${allowed} permitidas`)
    expect(worse).toEqual([])
  })

  it('el baseline no tiene entradas obsoletas', () => {
    const stale = Object.entries(baseline.pending)
      .filter(([file, allowed]) => (countByFile.get(file) ?? 0) < allowed)
      .map(([file, allowed]) => `${file}: ${countByFile.get(file) ?? 0} < ${allowed} — baja el número`)
    const gone = Object.keys(baseline.exempt).filter((file) => !countByFile.has(file))
    expect([...stale, ...gone.map((f) => `${f}: exento pero ya no tiene texto — bórralo`)]).toEqual([])
  })
})
