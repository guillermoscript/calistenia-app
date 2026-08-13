/**
 * Geometría de la zona de recorrido de la tarjeta de carrera (#316).
 *
 * La tarjeta se dibuja en canvas de una tacada, así que no hay nada que
 * renderizar ni assertir sobre el DOM. Lo que sí se puede —y hay que— testear
 * es lo único que puede romperse de forma invisible: **el recorrido pisando el
 * pie de la tarjeta**. El bloque superior es de altura variable (el nombre de
 * la carrera se parte en tantas líneas como haga falta), así que el panel de
 * recorrido se dibuja en lo que sobre, y «lo que sobre» puede ser negativo.
 *
 * Un fallo aquí no lanza: sale una imagen con el logo tachado por una línea
 * verde y nadie se entera hasta que se ha compartido.
 */
import { describe, it, expect } from 'vitest'
import { routePanelGeometry, FOOTER_OFFSET, MIN_ROUTE_PANEL_H } from './RaceShareCard'

/** Alto de la tarjeta en unidades escaladas (el canvas es 1080×1920 a escala 2). */
const CARD_H = 960
/** Y de la línea divisoria del pie, tal y como la dibuja la tarjeta. */
const FOOTER_LINE = CARD_H - FOOTER_OFFSET - 6

describe('routePanelGeometry', () => {
  it('en una carrera normal el panel cabe y se dibuja', () => {
    // Caso típico: nombre de una línea, ganador, 5 participantes → el bloque de
    // arriba termina sobre y≈672.
    const g = routePanelGeometry(672, CARD_H)
    expect(g.visible).toBe(true)
    expect(g.height).toBeGreaterThanOrEqual(MIN_ROUTE_PANEL_H)
  })

  it('NUNCA invade el pie, sea cual sea la altura del bloque de arriba', () => {
    // El invariante que justifica que esta función exista.
    for (let listBottom = 0; listBottom <= CARD_H; listBottom += 7) {
      const g = routePanelGeometry(listBottom, CARD_H)
      if (!g.visible) continue
      expect(
        g.top + g.height,
        `con listBottom=${listBottom} el panel llega a ${g.top + g.height} y el pie está en ${FOOTER_LINE}`,
      ).toBeLessThanOrEqual(FOOTER_LINE)
    }
  })

  it('se omite cuando el nombre de la carrera empuja tanto que no queda sitio', () => {
    // Nombre larguísimo → el bloque de arriba se come la tarjeta.
    const g = routePanelGeometry(820, CARD_H)
    expect(g.visible).toBe(false)
  })

  it('no se estira sin límite en una tarjeta con mucho hueco', () => {
    // Sin tope, una carrera de 1 participante dejaría un panel gigante y hueco.
    const g = routePanelGeometry(200, CARD_H)
    expect(g.height).toBeLessThanOrEqual(190)
  })

  it('un hueco negativo da altura negativa y NO visible, en vez de dibujar al revés', () => {
    const g = routePanelGeometry(CARD_H + 100, CARD_H)
    expect(g.visible).toBe(false)
  })

  it('deja aire entre el panel y la línea del pie: no van pegados', () => {
    const g = routePanelGeometry(672, CARD_H)
    expect(FOOTER_LINE - (g.top + g.height)).toBeGreaterThan(0)
  })
})
