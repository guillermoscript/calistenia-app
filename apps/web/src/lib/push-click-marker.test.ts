import { describe, expect, it } from 'vitest'
import { readNotificationClickMarker, withNotificationClickMarker } from './push-click-marker'

describe('withNotificationClickMarker', () => {
  it('añade el marcador a una URL sin query', () => {
    const marked = withNotificationClickMarker('/workout', { campaign: 'inactivity_24h' })
    expect(marked).toBe('/workout?notif_click=1&notif_campaign=inactivity_24h')
  })

  it('conserva la query existente de la URL de destino', () => {
    const marked = withNotificationClickMarker('/social?session=abc', { campaign: 'comment' })
    const url = new URL(marked, 'https://x.test')
    expect(url.pathname).toBe('/social')
    expect(url.searchParams.get('session')).toBe('abc')
    expect(url.searchParams.get('notif_click')).toBe('1')
    expect(url.searchParams.get('notif_campaign')).toBe('comment')
  })

  it('sin campaña, solo pone el marcador', () => {
    const marked = withNotificationClickMarker('/', {})
    expect(marked).toBe('/?notif_click=1')
  })

  it('conserva el hash de la URL de destino', () => {
    const marked = withNotificationClickMarker('/nutrition#today', { campaign: 'meal' })
    expect(marked.endsWith('#today')).toBe(true)
  })

  it('no acepta un título: el marcador nunca lleva texto libre (posible nombre de otro usuario) por la URL', () => {
    const marked = withNotificationClickMarker('/social', { campaign: 'comment' })
    expect(marked).not.toContain('title')
    expect(marked).not.toContain('notif_title')
  })
})

describe('readNotificationClickMarker', () => {
  it('devuelve null cuando la URL no lleva marcador (arranque normal)', () => {
    expect(readNotificationClickMarker('https://gym.guille.tech/nutrition')).toBeNull()
    expect(readNotificationClickMarker('https://gym.guille.tech/')).toBeNull()
  })

  it('lee la campaña y devuelve la URL limpia sin el marcador', () => {
    const href = 'https://gym.guille.tech/workout?notif_click=1&notif_campaign=inactivity_24h'
    const marker = readNotificationClickMarker(href)
    expect(marker).toEqual({ campaign: 'inactivity_24h', cleanUrl: '/workout' })
  })

  it('quita solo los parámetros del marcador, conserva el resto de la query', () => {
    const href = 'https://gym.guille.tech/social?session=abc&notif_click=1&notif_campaign=comment&comment=xyz'
    const marker = readNotificationClickMarker(href)
    expect(marker?.cleanUrl).toBe('/social?session=abc&comment=xyz')
    expect(marker?.campaign).toBe('comment')
  })

  it('round-trip: lo que escribe withNotificationClickMarker, lo entiende readNotificationClickMarker', () => {
    const marked = withNotificationClickMarker('/challenges/42?ref=push', { campaign: 'challenge' })
    const href = `https://gym.guille.tech${marked}`
    const marker = readNotificationClickMarker(href)
    expect(marker).toEqual({ campaign: 'challenge', cleanUrl: '/challenges/42?ref=push' })
  })

  it('ignora un notif_title inyectado a mano: no forma parte del contrato del marcador', () => {
    const href = 'https://gym.guille.tech/workout?notif_click=1&notif_title=Ana+coment%C3%B3&notif_campaign=comment'
    const marker = readNotificationClickMarker(href)
    expect(marker).not.toHaveProperty('title')
    expect(marker?.cleanUrl).toBe('/workout?notif_title=Ana+coment%C3%B3')
  })
})
