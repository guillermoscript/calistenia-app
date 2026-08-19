import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Guardarraíl de los ficheros de traducción (issue #379).
//
// El bug que esto previene: si una clave se define dos veces en el mismo
// JSON, `JSON.parse` se queda con la última y la primera se convierte en
// copy muerto — nadie avisa, no hay error, y editar la definición de arriba
// no cambia nada en la app. En #379 había 25 claves así.
//
// Por eso estos tests leen los ficheros como TEXTO y no sólo como objeto:
// parsearlos es exactamente lo que esconde el problema.

const LOCALES_DIR = path.dirname(fileURLToPath(import.meta.url))

const localeFile = (locale: string) => path.join(LOCALES_DIR, locale, 'translation.json')

const locales = fs
  .readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(localeFile(e.name)))
  .map((e) => e.name)
  .sort()

const readRaw = (locale: string) => fs.readFileSync(localeFile(locale), 'utf8')
const readParsed = (locale: string) => JSON.parse(readRaw(locale)) as Record<string, string>

/** Todas las claves en orden de aparición, incluidas las repetidas. */
function rawKeys(locale: string): string[] {
  return readRaw(locale)
    .split('\n')
    .map((line) => line.match(/^ {2}"((?:[^"\\]|\\.)+)":/)?.[1])
    .filter((k): k is string => k !== undefined)
}

/** Los `{{placeholders}}` de una cadena, normalizados y ordenados. */
function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([\w.]+)/g)].map((m) => m[1]).sort()
}

it('hay al menos un locale que comprobar', () => {
  // Si el descubrimiento de locales se rompe, el resto de tests pasarían en
  // vacío y el guardarraíl sería decorativo.
  expect(locales.length).toBeGreaterThan(0)
})

describe.each(locales)('locales/%s/translation.json', (locale) => {
  it('es un objeto plano de clave -> cadena', () => {
    // Los tests de duplicados y de paridad se apoyan en que el fichero es
    // plano y con una clave por línea. Si alguien anida un objeto, el escaneo
    // por líneas dejaría de cubrirlo EN SILENCIO, así que se comprueba aquí.
    const parsed = readParsed(locale)
    const noStrings = Object.entries(parsed).filter(([, v]) => typeof v !== 'string')
    expect(noStrings.map(([k]) => k)).toEqual([])

    expect(rawKeys(locale)).toHaveLength(Object.keys(parsed).length)
  })

  it('no define ninguna clave dos veces', () => {
    const seen = new Set<string>()
    const duplicated = new Set<string>()
    for (const key of rawKeys(locale)) {
      if (seen.has(key)) duplicated.add(key)
      seen.add(key)
    }

    // Mensaje explícito: en un fichero de 4.000 líneas, saber CUÁL está
    // duplicada es la diferencia entre arreglarlo y volver a ignorarlo.
    expect([...duplicated].sort()).toEqual([])
  })
})

describe('paridad entre locales', () => {
  const [reference, ...rest] = locales

  it.each(rest)('%s tiene exactamente las mismas claves que ' + locales[0], (locale) => {
    const refKeys = Object.keys(readParsed(reference)).sort()
    const keys = Object.keys(readParsed(locale)).sort()

    expect({
      faltan: refKeys.filter((k) => !keys.includes(k)),
      sobran: keys.filter((k) => !refKeys.includes(k)),
    }).toEqual({ faltan: [], sobran: [] })
  })

  it.each(rest)('%s interpola las mismas variables que ' + locales[0], (locale) => {
    const ref = readParsed(reference)
    const target = readParsed(locale)

    // Se compara sobre campos fijos (`ref`/`target`) y sólo al final se
    // reetiquetan con el nombre del idioma: con claves computadas TS colapsa
    // el tipo del valor a `string | string[]` y `.join` deja de existir.
    const mismatches = Object.keys(ref)
      .filter((k) => k in target)
      .map((k) => ({ key: k, ref: placeholders(ref[k]), target: placeholders(target[k]) }))
      .filter((m) => m.ref.join(',') !== m.target.join(','))
      .map((m) => ({ key: m.key, [reference]: m.ref, [locale]: m.target }))

    // Un `{{count}}` que falta en un idioma no rompe el build: sale la frase
    // sin el número y ya está. Se ve en producción o no se ve.
    expect(mismatches).toEqual([])
  })
})
