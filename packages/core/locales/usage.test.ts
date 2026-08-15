import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Guardarraíl en la dirección que faltaba (issue #444).
//
// `translations.test.ts` comprueba los locales entre sí (planos, sin
// duplicados, paridad es/en). Pero una clave que el código pide y NO existe en
// ningún locale pasa todo eso: falta en los dos por igual. i18next entonces
// devuelve la clave tal cual y React la pinta — «workout.skip» como texto de un
// botón. Ni el typecheck ni el lint pueden verlo porque `t()` recibe un string.
//
// Este test escanea los literales `t('…')` / `i18n.t('…')` de las dos apps y
// falla si alguno no resuelve en cada locale. Es estricto a propósito: un
// `defaultValue` para una clave que no existe es «el mismo texto en español y
// en inglés», justo lo que i18n debería evitar, así que también falla.

const LOCALES_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(LOCALES_DIR, '../../..')

const APPS = [
  { name: 'web', dir: path.join(REPO_ROOT, 'apps/web/src') },
  { name: 'mobile', dir: path.join(REPO_ROOT, 'apps/mobile/src') },
]

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.expo', 'android', 'ios', 'coverage'])
const SOURCE_FILE = /\.tsx?$/
const TEST_FILE = /\.(test|spec)\.tsx?$/

// i18next resuelve `key` a través de `key_one`, `key_other`… según el idioma.
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other']

const locales = fs
  .readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(LOCALES_DIR, e.name, 'translation.json')))
  .map((e) => e.name)
  .sort()

const dictionaries = Object.fromEntries(
  locales.map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, locale, 'translation.json'), 'utf8')) as Record<
      string,
      string
    >,
  ]),
)

function resolves(dictionary: Record<string, string>, key: string): boolean {
  if (Object.prototype.hasOwnProperty.call(dictionary, key)) return true
  return PLURAL_SUFFIXES.some((suffix) => Object.prototype.hasOwnProperty.call(dictionary, key + suffix))
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

interface CallSite {
  line: number
  key: string
}

// Encuentra `t(` / `i18n.t(` (no `split(`, no `format(`) y extrae el PRIMER
// argumento respetando comillas y llamadas multilínea. Un regex por línea no
// vale: `t('key',\n { count })` es habitual y `t(`day.${i}`)` no es literal.
const CALL_START = /(^|[^\w.$])(?:i18n\.)?t\(/g

function staticKeyCalls(src: string): { sites: CallSite[]; dynamic: number } {
  const sites: CallSite[] = []
  let dynamic = 0
  let match: RegExpExecArray | null
  while ((match = CALL_START.exec(src))) {
    let i = match.index + match[0].length
    while (i < src.length && /\s/.test(src[i])) i++
    const quote = src[i]
    if (quote !== "'" && quote !== '"' && quote !== '`') {
      dynamic++ // t(variable), t(cond ? a : b)…
      continue
    }
    let j = i + 1
    let value = ''
    let interpolated = false
    while (j < src.length && src[j] !== quote) {
      if (src[j] === '\\') {
        value += src[j + 1] ?? ''
        j += 2
        continue
      }
      if (quote === '`' && src[j] === '$' && src[j + 1] === '{') interpolated = true
      value += src[j]
      j++
    }
    // Un literal seguido de `+` es concatenación: clave dinámica.
    let k = j + 1
    while (k < src.length && /\s/.test(src[k])) k++
    if (interpolated || src[k] === '+') {
      dynamic++
      continue
    }
    sites.push({ line: src.slice(0, match.index).split('\n').length, key: value })
  }
  return { sites, dynamic }
}

describe.each(APPS.map((a) => [a.name, a.dir]))('claves i18n usadas por apps/%s', (_name, dir) => {
  const scanned = walk(dir).map((file) => ({
    file: path.relative(REPO_ROOT, file),
    ...staticKeyCalls(fs.readFileSync(file, 'utf8')),
  }))
  const totalSites = scanned.reduce((n, f) => n + f.sites.length, 0)

  it('el escaneo encuentra llamadas a t() (si no, el resto pasa en vacío)', () => {
    expect(totalSites).toBeGreaterThan(1000)
  })

  it.each(locales)('todas resuelven en locales/%s/translation.json', (locale) => {
    const dictionary = dictionaries[locale]
    const missing = scanned.flatMap(({ file, sites }) =>
      sites.filter((s) => !resolves(dictionary, s.key)).map((s) => `${file}:${s.line} → ${s.key}`),
    )
    // Mensaje explícito con fichero:línea: la clave que falta se arregla en
    // el locale, pero hay que saber desde dónde se pide.
    expect(missing).toEqual([])
  })
})
