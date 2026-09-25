import { describe, expect, it } from 'vitest'
import { preferredMarketingLocale } from './marketing-locale'

// #821: idioma por defecto inglés para cualquier dispositivo/navegador que no
// esté en español. Antes, `language?.startsWith('en') ? 'en' : 'es'` mandaba
// a español cualquier idioma que no empezara por "en" — incluidas las
// variantes de portugués, alemán, hindi, indonesio… que ni son español ni
// inglés.
describe('preferredMarketingLocale (#821)', () => {
  it.each(['pt-BR', 'de-DE', 'hi-IN', 'id-ID', 'fr-FR'])(
    '"%s" (no español) → inglés',
    (language) => {
      expect(preferredMarketingLocale(language)).toBe('en')
    },
  )

  it.each(['es-MX', 'es-AR', 'es'])('"%s" (español) → español', (language) => {
    expect(preferredMarketingLocale(language)).toBe('es')
  })

  it('sin idioma detectado → inglés', () => {
    expect(preferredMarketingLocale(undefined)).toBe('en')
  })
})
