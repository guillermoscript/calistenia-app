import { describe, it, expect } from 'vitest'
import { sharedProgramUrl, buildProgramShareContent } from './programShare'
import { WEB_BASE_URL } from './app-urls'

/**
 * Lo que este test protege no es el formato de la cadena, es que el enlace
 * apunte a un sitio que le abra a OTRA persona (#604).
 *
 * Había dos constructores distintos para esta misma URL y el que colgaba del
 * botón de las tarjetas usaba `window.location.origin`, así que en desarrollo
 * el botón «Compartir» copiaba `http://localhost:5173/shared/…`. Un enlace que
 * solo funciona en la máquina de quien lo envía es exactamente el fallo que la
 * unificación viene a cerrar, y es de los que un test de formato deja pasar si
 * se limita a comprobar que la cadena "contiene /shared/".
 */
describe('sharedProgramUrl', () => {
  it('cuelga del origen público de la app, nunca del local', () => {
    expect(sharedProgramUrl('abc123')).toBe(`${WEB_BASE_URL}/shared/abc123`)
    expect(sharedProgramUrl('abc123')).toMatch(/^https:\/\//)
    expect(sharedProgramUrl('abc123')).not.toContain('localhost')
  })
})

describe('buildProgramShareContent', () => {
  it('arma el objeto que aceptan navigator.share y Share.share', () => {
    const content = buildProgramShareContent(
      'Fuerza 12 semanas',
      'p1',
      'Mira este programa: Fuerza 12 semanas',
    )

    expect(content).toEqual({
      title: 'Fuerza 12 semanas',
      text: 'Mira este programa: Fuerza 12 semanas',
      url: `${WEB_BASE_URL}/shared/p1`,
    })
  })

  it('no traduce por su cuenta: el texto entra ya resuelto', () => {
    // `t()` en core sin i18next inicializado devuelve `undefined`, y este módulo
    // lo consumen web, móvil y los tests con instancias distintas. Traducir aquí
    // dejaría el texto en blanco justo donde nadie mira.
    const content = buildProgramShareContent('Nombre', 'p2', '')
    expect(content.text).toBe('')
    expect(content.url).toBe(`${WEB_BASE_URL}/shared/p2`)
  })
})
