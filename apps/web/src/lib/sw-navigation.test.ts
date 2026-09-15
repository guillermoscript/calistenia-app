import { describe, expect, it } from 'vitest'
import { isDeniedNavigation } from './sw-navigation'

const path = (url: string) => {
  const u = new URL(url, 'https://gym.guille.tech')
  return u.pathname + u.search
}

describe('isDeniedNavigation', () => {
  it('deja pasar a la red el bridge de OAuth con la query que añade Google', () => {
    // URL real del redirect de Google al elegir la cuenta (code y state falsos).
    const bridge = path(
      '/oauth-bridge.html?state=abc&iss=https%3A%2F%2Faccounts.google.com&code=4%2F0AbCd&scope=email+profile+openid&authuser=3&prompt=none',
    )
    expect(isDeniedNavigation(bridge)).toBe(true)
    expect(isDeniedNavigation('/oauth-bridge.html')).toBe(true)
  })

  it('deja pasar ficheros de public/ y del prerender aunque lleven query', () => {
    expect(isDeniedNavigation('/privacy.html?lang=en')).toBe(true)
    expect(isDeniedNavigation('/delete-account.html')).toBe(true)
    expect(isDeniedNavigation('/sitemap.xml?v=2')).toBe(true)
    expect(isDeniedNavigation('/robots.txt')).toBe(true)
  })

  it('deja pasar PocketBase, MCP, blog y assets', () => {
    expect(isDeniedNavigation('/api/oauth2-redirect?code=x&state=y')).toBe(true)
    expect(isDeniedNavigation('/_/#/auth/oauth2-redirect-success')).toBe(true)
    expect(isDeniedNavigation('/mcp')).toBe(true)
    expect(isDeniedNavigation('/blog/mi-post')).toBe(true)
    expect(isDeniedNavigation('/assets/index-abc.js')).toBe(true)
  })

  it('sirve el shell en las rutas de la SPA, también con puntos en la query', () => {
    expect(isDeniedNavigation('/')).toBe(false)
    expect(isDeniedNavigation('/es/')).toBe(false)
    expect(isDeniedNavigation('/programs/123')).toBe(false)
    expect(isDeniedNavigation('/race/abc?ref=a.b')).toBe(false)
    expect(isDeniedNavigation('/invite/XYZ?utm_source=play.google.com')).toBe(false)
  })
})
