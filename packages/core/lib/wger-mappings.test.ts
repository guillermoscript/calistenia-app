import { describe, it, expect } from 'vitest'
import { mapWgerToExerciseCatalog } from './wger-mappings'
import type { WgerExerciseInfo } from './wger'

const baseInfo = (overrides: Partial<WgerExerciseInfo> = {}): WgerExerciseInfo => ({
  id: 100,
  name: 'Bench Press',
  description: '<p>Empuja la barra</p>',
  muscles: [],
  muscles_secondary: [],
  equipment: [],
  category: { id: 11, name: 'Chest' },
  images: [],
  videos: [],
  translations: [],
  ...overrides,
})

describe('mapWgerToExerciseCatalog — traducciones', () => {
  it('usa la traducción en español si existe', () => {
    const info = baseInfo({
      translations: [
        { id: 1, language: 4, name: 'Press de banca', description: '<b>Desc ES</b>' },
        { id: 2, language: 2, name: 'Bench Press', description: 'Desc EN' },
      ],
    })
    const result = mapWgerToExerciseCatalog(info, 'es')
    expect(result.name.es).toBe('Press de banca')
    expect(result.name.en).toBe('Bench Press')
    expect(result.description.es).toBe('Desc ES')
    expect(result.description.en).toBe('Desc EN')
  })

  it('cae a inglés si no hay traducción en el idioma pedido', () => {
    const info = baseInfo({
      translations: [{ id: 2, language: 2, name: 'Bench Press', description: 'Desc EN' }],
    })
    const result = mapWgerToExerciseCatalog(info, 'es')
    expect(result.name.es).toBe('Bench Press')
    expect(result.description.es).toBe('Desc EN')
  })

  it('cae al name/description de nivel superior si no hay traducciones', () => {
    const info = baseInfo({ translations: [] })
    const result = mapWgerToExerciseCatalog(info, 'es')
    expect(result.name.es).toBe('Bench Press')
    expect(result.description.es).toBe('Empuja la barra')
  })

  it('elimina las etiquetas HTML de la descripción', () => {
    const info = baseInfo({ description: '<p>Línea 1</p><br/><strong>Línea 2</strong>' })
    const result = mapWgerToExerciseCatalog(info)
    expect(result.description.es).not.toMatch(/<[^>]+>/)
  })

  it('idioma no reconocido (fr) cae al mapeo de "es" para elegir la traducción', () => {
    const info = baseInfo({
      translations: [{ id: 1, language: 4, name: 'Nombre ES', description: '' }],
    })
    const result = mapWgerToExerciseCatalog(info, 'fr')
    expect(result.name.es).toBe('Nombre ES')
  })
})

describe('mapWgerToExerciseCatalog — equipment', () => {
  it('mapea equipment conocido y cae a "ninguno" para ids desconocidos', () => {
    const info = baseInfo({ equipment: [{ id: 1, name: 'Barbell' }, { id: 999, name: 'Unknown' }] })
    const result = mapWgerToExerciseCatalog(info)
    expect(result.equipment).toEqual(expect.arrayContaining(['lastre', 'ninguno']))
  })

  it('deduplica equipment cuando dos ids de wger mapean al mismo id de app', () => {
    const info = baseInfo({ equipment: [{ id: 1, name: 'Barbell' }, { id: 3, name: 'Dumbbell' }] })
    const result = mapWgerToExerciseCatalog(info)
    expect(result.equipment).toEqual(['lastre'])
  })

  it('sin equipment devuelve ["ninguno"]', () => {
    const info = baseInfo({ equipment: [] })
    expect(mapWgerToExerciseCatalog(info).equipment).toEqual(['ninguno'])
  })
})

describe('mapWgerToExerciseCatalog — categoría', () => {
  it('category "Arms" (8) se refina a "pull" si hay músculo de tracción (bíceps)', () => {
    const info = baseInfo({
      category: { id: 8, name: 'Arms' },
      muscles: [{ id: 1, name: 'Biceps', name_en: 'Biceps' }],
    })
    expect(mapWgerToExerciseCatalog(info).category).toBe('pull')
  })

  it('category "Arms" (8) se refina a "push" si no hay músculo de tracción', () => {
    const info = baseInfo({
      category: { id: 8, name: 'Arms' },
      muscles: [{ id: 2, name: 'Deltoids', name_en: 'Deltoids' }],
    })
    expect(mapWgerToExerciseCatalog(info).category).toBe('push')
  })

  it('category desconocida cae a "full"', () => {
    const info = baseInfo({ category: { id: 999, name: 'Rara' } })
    expect(mapWgerToExerciseCatalog(info).category).toBe('full')
  })

  it('mapea las categorías conocidas restantes', () => {
    expect(mapWgerToExerciseCatalog(baseInfo({ category: { id: 9, name: 'Legs' } })).category).toBe('legs')
    expect(mapWgerToExerciseCatalog(baseInfo({ category: { id: 10, name: 'Abs' } })).category).toBe('core')
    expect(mapWgerToExerciseCatalog(baseInfo({ category: { id: 12, name: 'Back' } })).category).toBe('pull')
  })
})

describe('mapWgerToExerciseCatalog — músculos', () => {
  it('mapea y deduplica músculos primarios/secundarios que caen en el mismo nombre en español', () => {
    const info = baseInfo({
      muscles: [{ id: 3, name: 'Pectoralis', name_en: 'Chest' }],
      muscles_secondary: [{ id: 5, name: 'Serratus', name_en: 'Serratus' }], // también mapea a 'Pecho'
    })
    const result = mapWgerToExerciseCatalog(info)
    expect(result.muscles.es).toBe('Pecho')
  })

  it('músculo sin mapeo conocido cae al nombre original de wger', () => {
    const info = baseInfo({ muscles: [{ id: 42, name: 'Musculo raro', name_en: 'Weird muscle' }] })
    const result = mapWgerToExerciseCatalog(info)
    expect(result.muscles.es).toBe('Musculo raro')
  })
})

describe('mapWgerToExerciseCatalog — slug y campos fijos', () => {
  it('genera un slug en minúsculas, sin acentos ni caracteres especiales', () => {
    const info = baseInfo({
      translations: [{ id: 1, language: 4, name: 'Flexión de Pecho (Básica)', description: '' }],
    })
    const result = mapWgerToExerciseCatalog(info, 'es')
    expect(result.slug).toBe('flexion-de-pecho-basica')
  })

  it('pasa wger_id y wger_language sin modificar, y fija los valores por defecto del catálogo', () => {
    const info = baseInfo({ id: 777 })
    const result = mapWgerToExerciseCatalog(info, 'en')
    expect(result.wger_id).toBe(777)
    expect(result.wger_language).toBe('en')
    expect(result.source).toBe('wger')
    expect(result.priority).toBe('med')
    expect(result.default_sets).toBe(3)
    expect(result.default_reps).toBe('8-12')
    expect(result.default_rest_seconds).toBe(60)
  })
})

describe('mapWgerToExerciseCatalog — invariantes de las tablas de mapeo internas', () => {
  it('todo equipment id de wger conocido (1-10) produce un equipment id de app no vacío', () => {
    for (let id = 1; id <= 10; id++) {
      const info = baseInfo({ equipment: [{ id, name: `eq-${id}` }] })
      const result = mapWgerToExerciseCatalog(info)
      expect(result.equipment.length).toBeGreaterThan(0)
      expect(result.equipment[0].length).toBeGreaterThan(0)
    }
  })

  it('todo muscle id de wger conocido (1-15) produce un nombre de músculo no vacío', () => {
    for (let id = 1; id <= 15; id++) {
      const info = baseInfo({ muscles: [{ id, name: `m-${id}`, name_en: `m-${id}` }] })
      const result = mapWgerToExerciseCatalog(info)
      expect(result.muscles.es.length).toBeGreaterThan(0)
    }
  })
})
