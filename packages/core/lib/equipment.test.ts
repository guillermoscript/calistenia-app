import { describe, it, expect } from 'vitest'
import {
  EQUIPMENT_CATALOG,
  detectEquipment,
  getExerciseEquipment,
  getEquipmentLabelKey,
} from './equipment'

describe('EQUIPMENT_CATALOG', () => {
  it('no tiene ids duplicados', () => {
    const ids = EQUIPMENT_CATALOG.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cada entrada tiene id e icon no vacíos', () => {
    for (const item of EQUIPMENT_CATALOG) {
      expect(item.id.length).toBeGreaterThan(0)
      expect(item.icon.length).toBeGreaterThan(0)
    }
  })

  it('incluye "ninguno" (fallback que usa detectEquipment)', () => {
    expect(EQUIPMENT_CATALOG.some(e => e.id === 'ninguno')).toBe(true)
  })
})

describe('detectEquipment', () => {
  it('detecta barra de dominadas por nombre en español', () => {
    expect(detectEquipment({ name: 'Dominada estricta', note: '' })).toEqual(['barra_dominadas'])
  })

  it('detecta banco por nombre en inglés', () => {
    expect(detectEquipment({ name: 'Bench dips', note: '' })).toEqual(['banco'])
  })

  it('sin match conocido devuelve ["ninguno"]', () => {
    expect(detectEquipment({ name: 'Sentadilla', note: '' })).toEqual(['ninguno'])
  })

  it('puede detectar múltiples equipos a la vez', () => {
    const result = detectEquipment({
      name: 'Dominada con mochila (lastre)',
      note: 'usa banda elastica para asistir',
    })
    expect(result).toEqual(expect.arrayContaining(['barra_dominadas', 'lastre', 'banda_elastica']))
    expect(result).toHaveLength(3)
  })

  it('busca en note además de en name', () => {
    expect(detectEquipment({ name: 'Ejercicio genérico', note: 'contra la pared' })).toEqual(['pared'])
  })

  it('es case-insensitive', () => {
    expect(detectEquipment({ name: 'PULL-UP', note: '' })).toEqual(['barra_dominadas'])
  })
})

describe('getExerciseEquipment', () => {
  it('prioriza el campo equipment explícito si existe y no está vacío', () => {
    expect(getExerciseEquipment({ name: 'Push-up', note: '', equipment: ['anillas'] })).toEqual(['anillas'])
  })

  it('cae a detectEquipment si equipment está vacío o ausente', () => {
    expect(getExerciseEquipment({ name: 'Dominada', note: '', equipment: [] })).toEqual(['barra_dominadas'])
    expect(getExerciseEquipment({ name: 'Sentadilla', note: '' })).toEqual(['ninguno'])
  })
})

describe('getEquipmentLabelKey', () => {
  it('construye la clave de i18n con el prefijo "equipment."', () => {
    expect(getEquipmentLabelKey('barra_dominadas')).toBe('equipment.barra_dominadas')
    expect(getEquipmentLabelKey('ninguno')).toBe('equipment.ninguno')
  })
})
