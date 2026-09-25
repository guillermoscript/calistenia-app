import { afterEach, describe, expect, it, vi } from 'vitest'

// #821: español SOLO si el idioma detectado es realmente español; inglés
// para todo lo demás. Test de integración con el i18next REAL de la app (no
// se mockea react-i18next ni el detector): monta `./i18n` de cero para cada
// `navigator.language`, como haría el navegador en frío, sin storage previo.
//
// Se comprueba `i18n.language`/`resolvedLanguage`, no solo `t()`: decenas de
// sitios (packages/core/lib/i18n-db.ts::localize(), varios `i18n.language
// === 'en' ? … : 'es'` en apps/web) leen `i18n.language` en crudo. Con solo
// cambiar `fallbackLng` los textos de `t()` caerían a inglés pero
// `i18n.language` seguiría siendo la etiqueta cruda (`pt-BR`) y esos sitios
// devolverían español igualmente — justo el bug que motiva la issue.

async function freshI18nFor(navigatorLanguage: string | undefined) {
  vi.resetModules()
  window.localStorage.clear()
  Object.defineProperty(window.navigator, 'language', {
    value: navigatorLanguage ?? '',
    configurable: true,
  })
  Object.defineProperty(window.navigator, 'languages', {
    value: navigatorLanguage ? [navigatorLanguage] : [],
    configurable: true,
  })
  const mod = await import('./i18n')
  return mod.default
}

afterEach(() => {
  vi.resetModules()
})

describe('idioma inicial sin override guardado (#821)', () => {
  it.each([
    ['pt-BR', 'en'],
    ['de-DE', 'en'],
    ['hi-IN', 'en'],
    ['id-ID', 'en'],
    ['fr-FR', 'en'],
  ])('navegador en "%s" (no español) → %s en language y resolvedLanguage', async (navLang, expected) => {
    const i18n = await freshI18nFor(navLang)
    expect(i18n.language).toBe(expected)
    expect(i18n.resolvedLanguage).toBe(expected)
    expect(i18n.t('common.close', { defaultValue: '__missing__' })).not.toBe('__missing__')
  })

  it.each([
    ['es', 'es'],
    ['es-MX', 'es'],
    ['es-AR', 'es'],
  ])(
    'navegador en "%s" (español, con o sin región propia) → resolvedLanguage %s',
    async (navLang, expectedResolved) => {
      const i18n = await freshI18nFor(navLang)
      // `resolvedLanguage` es el idioma cuyo bundle usa `t()` de verdad: una
      // región sin bundle propio (es-MX/es-AR) debe seguir cayendo al
      // idioma base (es) vía el propio matching de i18next, NO a inglés.
      expect(i18n.resolvedLanguage).toBe(expectedResolved)
      expect(i18n.language.toLowerCase().startsWith('es')).toBe(true)
    },
  )

  it('sin idioma de navegador detectable → inglés (fallbackLng)', async () => {
    const i18n = await freshI18nFor(undefined)
    expect(i18n.resolvedLanguage).toBe('en')
  })
})

describe('el idioma guardado gana siempre sobre el del dispositivo (#821)', () => {
  it('guardado "es" con navegador en inglés → español', async () => {
    window.localStorage.setItem('i18nextLng', 'es')
    Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true })
    Object.defineProperty(window.navigator, 'languages', { value: ['en-US'], configurable: true })
    vi.resetModules()
    const mod = await import('./i18n')
    expect(mod.default.language).toBe('es')
  })

  it('guardado "en" con navegador en portugués → sigue en inglés', async () => {
    window.localStorage.setItem('i18nextLng', 'en')
    Object.defineProperty(window.navigator, 'language', { value: 'pt-BR', configurable: true })
    Object.defineProperty(window.navigator, 'languages', { value: ['pt-BR'], configurable: true })
    vi.resetModules()
    const mod = await import('./i18n')
    expect(mod.default.language).toBe('en')
  })
})
