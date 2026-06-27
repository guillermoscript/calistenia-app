import { describe, it, expect } from 'vitest'
import {
  compareVersions,
  getUnseenVersions,
  pickLang,
  dotColorForType,
  type ChangelogVersion,
} from '../whats-new'

function v(version: string): ChangelogVersion {
  return {
    version,
    date: '2026-01-01',
    summary: { es: `resumen ${version}`, en: `summary ${version}` },
    highlights: [],
  }
}

// Newest-first, como en el JSON real.
const VERSIONS = [v('1.0.4'), v('1.0.3'), v('1.0.2')]

describe('compareVersions', () => {
  it('ordena por major/minor/patch', () => {
    expect(compareVersions('1.0.4', '1.0.3')).toBe(1)
    expect(compareVersions('1.0.3', '1.0.4')).toBe(-1)
    expect(compareVersions('1.0.4', '1.0.4')).toBe(0)
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
  })

  it('tolera longitudes y partes no numéricas', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.1', '1.0')).toBe(1)
    expect(compareVersions('1.0.x', '1.0.0')).toBe(0)
  })
})

describe('getUnseenVersions', () => {
  it('primer arranque (sin lastSeen) → la más nueva instalada', () => {
    expect(getUnseenVersions(VERSIONS, '1.0.4', null).map((x) => x.version)).toEqual(['1.0.4'])
  })

  it('ya vio la más nueva → nada', () => {
    expect(getUnseenVersions(VERSIONS, '1.0.4', '1.0.4')).toEqual([])
  })

  it('actualización desde una versión vista → todo lo más nuevo', () => {
    expect(getUnseenVersions(VERSIONS, '1.0.4', '1.0.2').map((x) => x.version)).toEqual([
      '1.0.4',
      '1.0.3',
    ])
  })

  it('nunca muestra notas de una versión no instalada todavía', () => {
    // App en 1.0.3 pero el changelog ya tiene 1.0.4 → no se filtra 1.0.4.
    expect(getUnseenVersions(VERSIONS, '1.0.3', null).map((x) => x.version)).toEqual(['1.0.3'])
    expect(getUnseenVersions(VERSIONS, '1.0.3', '1.0.2').map((x) => x.version)).toEqual(['1.0.3'])
  })

  it('lastSeen desconocido y anterior a la más nueva → saluda con la más nueva', () => {
    expect(getUnseenVersions(VERSIONS, '1.0.4', '0.9.0').map((x) => x.version)).toEqual(['1.0.4'])
  })

  it('lastSeen igual o posterior a la más nueva instalada → nada', () => {
    expect(getUnseenVersions(VERSIONS, '1.0.4', '1.0.5')).toEqual([])
  })

  it('changelog sin versiones aplicables → nada', () => {
    expect(getUnseenVersions(VERSIONS, '1.0.0', null)).toEqual([])
  })
})

describe('pickLang', () => {
  const t = { es: 'hola', en: 'hello' }
  it('elige por idioma con fallback a es', () => {
    expect(pickLang(t, 'en')).toBe('hello')
    expect(pickLang(t, 'en-US')).toBe('hello')
    expect(pickLang(t, 'es')).toBe('hola')
    expect(pickLang(t, 'fr')).toBe('hola')
    expect(pickLang(undefined, 'es')).toBe('')
  })
})

describe('dotColorForType', () => {
  it('lima por defecto, ámbar para fix, sky para perf', () => {
    expect(dotColorForType('feat')).toContain('74 90% 45%')
    expect(dotColorForType(undefined)).toContain('74 90% 45%')
    expect(dotColorForType('fix')).toBe('#fbbf24')
    expect(dotColorForType('perf')).toBe('#38bdf8')
  })
})
