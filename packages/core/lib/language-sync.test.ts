/**
 * Cobertura de `language-sync.ts` (#804): el servidor elige el idioma de cada
 * push con `users.language`, así que lo guardado tiene que ser lo que la app
 * enseña de verdad y seguir al usuario cuando lo cambia.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const { update, authListeners, authStore } = vi.hoisted(() => {
  const authListeners: Array<() => void> = []
  return {
    update: vi.fn(),
    authListeners,
    authStore: {
      isValid: true,
      record: null as { id: string; language?: string } | null,
      onChange: (fn: () => void) => {
        authListeners.push(fn)
        return () => { authListeners.splice(authListeners.indexOf(fn), 1) }
      },
    },
  }
})

vi.mock('./pocketbase', () => ({
  pb: {
    authStore,
    collection: () => ({ update: (...a: unknown[]) => update(...a) }),
  },
}))

import i18n from 'i18next'
import { startLanguageSync, syncUserLanguage, toUserLanguage } from './language-sync'

describe('toUserLanguage', () => {
  it('español solo si la etiqueta es española, como la detección de la app (#821)', () => {
    expect(toUserLanguage('es')).toBe('es')
    expect(toUserLanguage('es-MX')).toBe('es')
    expect(toUserLanguage('ES')).toBe('es')
    expect(toUserLanguage('en')).toBe('en')
    expect(toUserLanguage('pt-BR')).toBe('en')
    expect(toUserLanguage('de')).toBe('en')
  })
})

describe('syncUserLanguage', () => {
  beforeEach(() => update.mockReset().mockResolvedValue({}))

  it('escribe el idioma normalizado cuando no hay nada guardado', async () => {
    expect(await syncUserLanguage('u1', undefined, 'es-AR')).toBe('es')
    expect(update).toHaveBeenCalledWith('u1', { language: 'es' })
  })

  it('SOBRESCRIBE un idioma distinto: el usuario lo cambió en la app', async () => {
    expect(await syncUserLanguage('u1', 'es', 'en')).toBe('en')
    expect(update).toHaveBeenCalledWith('u1', { language: 'en' })
  })

  it('no escribe si ya coincide', async () => {
    expect(await syncUserLanguage('u1', 'en', 'en-US')).toBe('en')
    expect(update).not.toHaveBeenCalled()
  })

  it('sin usuario o sin idioma no hace nada', async () => {
    expect(await syncUserLanguage('', 'es', 'en')).toBeNull()
    expect(await syncUserLanguage('u1', 'es', undefined)).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })

  it('nunca lanza si el guardado falla', async () => {
    update.mockRejectedValueOnce(new Error('offline'))
    await expect(syncUserLanguage('u1', undefined, 'en')).resolves.toBeNull()
  })
})

describe('startLanguageSync', () => {
  let stop: () => void

  beforeEach(async () => {
    update.mockReset().mockResolvedValue({})
    authStore.isValid = true
    authStore.record = { id: 'u1', language: 'es' }
    await i18n.init({ lng: 'es', resources: { es: { translation: {} }, en: { translation: {} } } })
  })

  afterEach(() => stop?.())

  it('sincroniza al arrancar, al cambiar de idioma y al iniciar sesión', async () => {
    authStore.record = { id: 'u1' }
    stop = startLanguageSync()
    expect(update).toHaveBeenLastCalledWith('u1', { language: 'es' })

    authStore.record = { id: 'u1', language: 'es' }
    await i18n.changeLanguage('en')
    expect(update).toHaveBeenLastCalledWith('u1', { language: 'en' })

    authStore.record = { id: 'u2', language: 'es' }
    authListeners.forEach(fn => fn())
    expect(update).toHaveBeenLastCalledWith('u2', { language: 'en' })
  })

  it('sin sesión válida no escribe nada', () => {
    authStore.isValid = false
    stop = startLanguageSync()
    expect(update).not.toHaveBeenCalled()
  })

  it('deja de escuchar al pararlo', async () => {
    stop = startLanguageSync()
    stop()
    await i18n.changeLanguage('en')
    expect(update).not.toHaveBeenCalled()
  })
})
