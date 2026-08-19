import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import i18next from 'i18next'

// Guardarraíl de los plurales (issue #420).
//
// Dos cosas que este fichero fija y que no se ven en los JSON:
//
// 1. Que `t('clave', { count })` con `clave_one` / `clave_other` resuelve a la
//    forma correcta. Una clave con plural mal escrita no rompe el build: sale
//    la cadena equivocada, o la clave cruda, y se descubre en producción.
//
// 2. Que sigue resolviendo **sin `Intl.PluralRules`**. Hermes (el motor de
//    `apps/mobile`) puede no traerlo. i18next cae entonces a una regla interna
//    `count === 1 ? 'one' : 'other'`, que es justo la cardinal de `es` y `en`,
//    pero eso es un detalle de implementación de i18next: si un día cambia,
//    el móvil se rompe y la web no. Este test lo nota antes.

const LOCALES_DIR = path.dirname(fileURLToPath(import.meta.url))

const localeFile = (locale: string) => path.join(LOCALES_DIR, locale, 'translation.json')

const locales = fs
  .readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(localeFile(e.name)))
  .map((e) => e.name)
  .sort()

const read = (locale: string) => JSON.parse(fs.readFileSync(localeFile(locale), 'utf8')) as Record<string, string>

/** Instancia nueva por test: i18next cachea las reglas de plural por instancia. */
function makeI18n(lng: string) {
  const instance = i18next.createInstance()
  instance.init({
    lng,
    fallbackLng: 'es',
    resources: Object.fromEntries(locales.map((l) => [l, { translation: read(l) }])),
    interpolation: { escapeValue: false },
  })
  return instance
}

/** Simula Hermes sin `Intl.PluralRules`. Devuelve el restaurador. */
function withoutIntlPluralRules(): () => void {
  // `Intl.PluralRules` es readonly para TS, pero en runtime es una propiedad
  // normal: este alias deja borrarla y reponerla sin silenciar el compilador.
  const intl = Intl as { PluralRules?: typeof Intl.PluralRules }
  const original = intl.PluralRules
  delete intl.PluralRules
  return () => {
    intl.PluralRules = original
  }
}

let restoreIntl: (() => void) | null = null

afterEach(() => {
  restoreIntl?.()
  restoreIntl = null
})

/** Todas las claves `x_one` de un locale, con su base y su forma `_other`. */
function pluralKeys(locale: string) {
  const data = read(locale)
  return Object.keys(data)
    .filter((k) => k.endsWith('_one'))
    .map((one) => ({ base: one.slice(0, -'_one'.length), one, other: `${one.slice(0, -'_one'.length)}_other` }))
}

describe.each(locales)('plurales en %s', (locale) => {
  it('define la forma _other de toda clave _one', () => {
    const data = read(locale)
    const huerfanas = pluralKeys(locale)
      .filter(({ other }) => !(other in data))
      .map(({ base }) => base)

    expect(huerfanas).toEqual([])
  })

  it('resuelve cada clave con plural a su forma singular y plural', () => {
    const data = read(locale)
    const i18n = makeI18n(locale)

    // Sin esto, si el escaneo de claves `_one` se rompiera, los dos tests
    // siguientes pasarían sobre una lista vacía y no cubrirían nada.
    expect(pluralKeys(locale).length).toBeGreaterThan(0)

    const fallos = pluralKeys(locale)
      .map(({ base, one, other }) => ({
        base,
        conUno: i18n.t(base, { count: 1 }),
        esperadoUno: data[one].replace('{{count}}', '1'),
        conDos: i18n.t(base, { count: 2 }),
        esperadoDos: data[other].replace('{{count}}', '2'),
      }))
      .filter((r) => r.conUno !== r.esperadoUno || r.conDos !== r.esperadoDos)

    expect(fallos).toEqual([])
  })

  it('sigue resolviendo sin Intl.PluralRules (Hermes / apps/mobile)', () => {
    const data = read(locale)
    restoreIntl = withoutIntlPluralRules()
    // La instancia se crea DESPUÉS de borrarlo: i18next resuelve la regla la
    // primera vez que la necesita y la cachea, así que una instancia creada
    // antes no reproduciría el entorno del móvil.
    const i18n = makeI18n(locale)

    // El test sólo vale si el borrado surtió efecto: si `Intl.PluralRules`
    // siguiera ahí, esto sería una copia del test anterior disfrazada.
    expect(Intl.PluralRules).toBeUndefined()

    const fallos = pluralKeys(locale)
      .map(({ base, one, other }) => ({
        base,
        conUno: i18n.t(base, { count: 1 }),
        esperadoUno: data[one].replace('{{count}}', '1'),
        conDos: i18n.t(base, { count: 2 }),
        esperadoDos: data[other].replace('{{count}}', '2'),
      }))
      .filter((r) => r.conUno !== r.esperadoUno || r.conDos !== r.esperadoDos)

    expect(fallos).toEqual([])
  })
})

describe('sleep.awakeningsCount (issue #420)', () => {
  // El caso concreto que motivó la clave: antes se componía a mano como
  // `${n} ${t('sleep.awakenings')}` y salía «· 1 Despertares nocturnos».
  it.each([
    ['es', 1, '1 despertar'],
    ['es', 3, '3 despertares'],
    ['en', 1, '1 awakening'],
    ['en', 3, '3 awakenings'],
  ])('%s con count=%i', (locale, count, expected) => {
    expect(makeI18n(locale).t('sleep.awakeningsCount', { count })).toBe(expected)
  })

  it('sleep.awakenings sigue siendo la etiqueta, sin número', () => {
    expect(makeI18n('es').t('sleep.awakenings')).toBe('Despertares nocturnos')
    expect(makeI18n('en').t('sleep.awakenings')).toBe('Night awakenings')
  })
})
