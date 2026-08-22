import { describe, it, expect, vi } from 'vitest'
import { NO_PHASE, isFreeSessionKey, sessionKeyLabel, sessionKeyParts } from './session-key'

vi.mock('i18next', () => ({
  default: { t: (key: string) => key },
}))

describe('isFreeSessionKey', () => {
  it('reconoce sesiones libres y manuales', () => {
    expect(isFreeSessionKey('free_1783000000')).toBe(true)
    expect(isFreeSessionKey('manual_1783000000')).toBe(true)
  })

  it('no confunde una clave de programa con una libre', () => {
    expect(isFreeSessionKey('p1_lun')).toBe(false)
    expect(isFreeSessionKey('p4_dom')).toBe(false)
  })
})

describe('sessionKeyParts', () => {
  it('extrae fase y día de una clave de programa', () => {
    expect(sessionKeyParts('p1_lun')).toEqual({ phase: 1, day: 'lun', isFree: false })
    expect(sessionKeyParts('p4_dom')).toEqual({ phase: 4, day: 'dom', isFree: false })
  })

  // El corazón del #376: -1 chocaba con `min: 0` y PocketBase rechazaba el
  // create con un 400 que se tragaba un catch, así que NINGUNA sesión libre
  // llegó nunca a la colección `sessions`.
  it('usa phase 0 (nunca -1) para sesiones libres y manuales', () => {
    expect(sessionKeyParts('free_1783000000')).toEqual({ phase: NO_PHASE, day: 'free', isFree: true })
    expect(sessionKeyParts('manual_1783000000')).toEqual({ phase: NO_PHASE, day: 'free', isFree: true })
    expect(NO_PHASE).toBe(0)
  })

  it('nunca produce un phase negativo ni NaN', () => {
    for (const key of ['free_1', 'manual_1', 'p1_lun', 'px_lun', 'basura', '', 'p_lun']) {
      const { phase } = sessionKeyParts(key)
      expect(Number.isFinite(phase)).toBe(true)
      expect(phase).toBeGreaterThanOrEqual(0)
    }
  })

  it('degrada una clave irreconocible a sesión libre en vez de a NaN', () => {
    expect(sessionKeyParts('px_lun')).toEqual({ phase: NO_PHASE, day: 'free', isFree: true })
    expect(sessionKeyParts('basura')).toEqual({ phase: NO_PHASE, day: 'free', isFree: true })
    expect(sessionKeyParts('')).toEqual({ phase: NO_PHASE, day: 'free', isFree: true })
  })

  it('mantiene el día multi-segmento de una clave de programa', () => {
    expect(sessionKeyParts('p2_mie_extra')).toEqual({ phase: 2, day: 'mie_extra', isFree: false })
  })
})

describe('sessionKeyLabel', () => {
  // El mock de i18next de arriba devuelve la clave (`t: key => key`), que es lo
  // que hace i18next cuando le falta la traducción. `tr()` lo trata como "no hay
  // texto" y cae al respaldo, así que estas aserciones comprueban justo el peor
  // caso: lo que el usuario ve cuando i18n no responde.
  it('etiqueta las sesiones libres en vez de enseñar la clave cruda', () => {
    expect(sessionKeyLabel('free_1783000000')).toBe('Sesión Libre')
    expect(sessionKeyLabel('manual_1783000000')).toBe('Sesión Libre')
  })

  it('humaniza una clave de programa que no está en el catálogo', () => {
    expect(sessionKeyLabel('p1_lun')).toBe('Fase 1 · lun')
    expect(sessionKeyLabel('p4_dom')).toBe('Fase 4 · dom')
  })

  it('deja pasar una clave irreconocible tal cual', () => {
    expect(sessionKeyLabel('seed_social_demo')).toBe('seed_social_demo')
  })

  /**
   * La regresión que motivó `tr()`: en la web, `packages/core` resuelve una
   * copia de i18next que nadie inicializa, y `t()` de una instancia sin init
   * devuelve `undefined` — ni la clave, ni cadena vacía. El muro pintaba el
   * título de toda sesión libre en blanco. Nada que llegue a la UI puede salir
   * de aquí vacío.
   */
  it('nunca devuelve vacío aunque i18next no esté inicializado', () => {
    for (const key of ['free_1', 'manual_1', 'p1_lun', 'px_lun', 'basura', '']) {
      expect(sessionKeyLabel(key)).toBeTruthy()
    }
  })
})
